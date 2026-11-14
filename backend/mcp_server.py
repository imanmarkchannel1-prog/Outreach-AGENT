"""Model Context Protocol (MCP) Server for Outreach ENGINE.

Mounted at /api/mcp for direct control by Antigravity Agent.
Exposes lead querying, deep research triggering, draft generation, and queue management.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from sqlalchemy import select, and_, func

from backend.database import AsyncSessionLocal
from backend.deliverability import deliverability_governor
from backend.models import Campaign, Company, Draft, Inbox, Lead, QueueSlot
from backend.pipeline import pipeline_coordinator
from backend.research_engine import research_engine
from backend.ai_writer import ai_writer

logger = logging.getLogger("outreach_engine.mcp")

outreach_mcp = FastMCP(
    "outreach-engine",
    instructions=(
        "Outreach ENGINE lead research, personalized anti-slop copy generation, "
        "and multi-inbox deliverability pacing tools for Antigravity Agent."
    ),
    host="0.0.0.0",
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    stateless_http=True,
    streamable_http_path="/",
)


@outreach_mcp.tool()
async def list_leads(
    q: str = "",
    status: str = "",
    campaign_id: Optional[int] = None,
    limit: int = 50,
) -> str:
    """List leads with optional search query, status filter (imported, researched, drafted, approved, sent), or campaign ID."""
    async with AsyncSessionLocal() as db:
        conditions = []
        if q:
            conditions.append(
                (Lead.full_name.ilike(f"%{q}%"))
                | (Lead.email.ilike(f"%{q}%"))
                | (Lead.role_title.ilike(f"%{q}%"))
            )
        if status:
            conditions.append(Lead.status == status)
        if campaign_id:
            conditions.append(Lead.campaign_id == campaign_id)

        stmt = select(Lead).limit(limit)
        if conditions:
            stmt = stmt.where(and_(*conditions))

        res = await db.execute(stmt)
        leads = res.scalars().all()

        output = []
        for l in leads:
            stmt_comp = select(Company).where(Company.id == l.company_id)
            c_res = await db.execute(stmt_comp)
            comp = c_res.scalar_one_or_none()

            output.append({
                "id": l.id,
                "name": l.full_name,
                "email": l.email,
                "company": comp.name if comp else None,
                "role": l.role_title,
                "role_category": l.role_category,
                "status": l.status,
                "has_dossier": bool(l.research_dossier),
            })
        return json.dumps({"count": len(output), "leads": output}, indent=2)


@outreach_mcp.tool()
async def get_lead_details(lead_id: int) -> str:
    """Get complete profile, web & Reddit research dossier, and email draft for a lead."""
    async with AsyncSessionLocal() as db:
        stmt = select(Lead).where(Lead.id == lead_id)
        res = await db.execute(stmt)
        lead = res.scalar_one_or_none()
        if not lead:
            return json.dumps({"error": f"Lead {lead_id} not found"})

        stmt_comp = select(Company).where(Company.id == lead.company_id)
        c_res = await db.execute(stmt_comp)
        comp = c_res.scalar_one_or_none()

        stmt_draft = select(Draft).where(Draft.lead_id == lead.id)
        d_res = await db.execute(stmt_draft)
        draft = d_res.scalar_one_or_none()

        data = {
            "id": lead.id,
            "name": lead.full_name,
            "email": lead.email,
            "role": lead.role_title,
            "company": comp.name if comp else None,
            "domain": comp.domain if comp else None,
            "status": lead.status,
            "research_dossier": lead.research_dossier,
            "draft": {
                "subject": draft.subject,
                "body": draft.body,
                "is_approved": draft.is_approved,
            } if draft else None,
        }
        return json.dumps(data, indent=2)


@outreach_mcp.tool()
async def research_prospect(lead_id: int) -> str:
    """Run live web and Reddit research for a specific prospect, identifying recent news (<30d) and community pain points."""
    async with AsyncSessionLocal() as db:
        stmt = select(Lead).where(Lead.id == lead_id)
        res = await db.execute(stmt)
        lead = res.scalar_one_or_none()
        if not lead:
            return json.dumps({"error": f"Lead {lead_id} not found"})

        stmt_comp = select(Company).where(Company.id == lead.company_id)
        c_res = await db.execute(stmt_comp)
        company = c_res.scalar_one_or_none()
        if not company:
            return json.dumps({"error": f"Company for lead {lead_id} not found"})

        dossier = await research_engine.build_dossier(lead, company)
        lead.research_dossier = dossier
        lead.status = "researched"
        await db.commit()

        return json.dumps({
            "status": "researched",
            "lead_id": lead.id,
            "dossier": dossier,
        }, indent=2)


@outreach_mcp.tool()
async def generate_email_draft(lead_id: int, custom_instructions: str = "") -> str:
    """Generate an anti-slop, hyper-personalized email draft based on research context and optional prompt instructions."""
    async with AsyncSessionLocal() as db:
        stmt = select(Lead).where(Lead.id == lead_id)
        res = await db.execute(stmt)
        lead = res.scalar_one_or_none()
        if not lead:
            return json.dumps({"error": f"Lead {lead_id} not found"})

        stmt_camp = select(Campaign).where(Campaign.id == lead.campaign_id)
        camp_res = await db.execute(stmt_camp)
        campaign = camp_res.scalar_one_or_none()
        if not campaign:
            return json.dumps({"error": "Campaign not found"})

        stmt_comp = select(Company).where(Company.id == lead.company_id)
        c_res = await db.execute(stmt_comp)
        company = c_res.scalar_one_or_none()

        dossier = lead.research_dossier or await research_engine.build_dossier(lead, company)
        subject, body, raw = await ai_writer.generate_draft(
            lead=lead,
            company=company,
            campaign=campaign,
            dossier=dossier,
            custom_instructions=custom_instructions,
        )

        # Upsert draft
        stmt_d = select(Draft).where(Draft.lead_id == lead.id)
        d_res = await db.execute(stmt_d)
        draft = d_res.scalar_one_or_none()
        if draft:
            draft.subject = subject
            draft.body = body
        else:
            draft = Draft(lead_id=lead.id, subject=subject, body=body, is_approved=False)
            db.add(draft)

        lead.status = "drafted"
        await db.commit()

        return json.dumps({
            "lead_id": lead.id,
            "subject": subject,
            "body": body,
        }, indent=2)


@outreach_mcp.tool()
async def approve_email_draft(
    lead_id: int,
    custom_subject: str = "",
    custom_body: str = "",
) -> str:
    """Approve an email draft (optionally updating subject/body) so it is ready for dispatch."""
    async with AsyncSessionLocal() as db:
        stmt = select(Draft).where(Draft.lead_id == lead_id)
        res = await db.execute(stmt)
        draft = res.scalar_one_or_none()
        if not draft:
            return json.dumps({"error": f"Draft for lead {lead_id} not found"})

        if custom_subject:
            draft.subject = custom_subject
        if custom_body:
            draft.body = custom_body

        draft.is_approved = True
        draft.approved_at = func.now()

        stmt_lead = select(Lead).where(Lead.id == lead_id)
        l_res = await db.execute(stmt_lead)
        lead = l_res.scalar_one_or_none()
        if lead:
            lead.status = "approved"

        await db.commit()
        return json.dumps({"status": "approved", "lead_id": lead_id})


@outreach_mcp.tool()
async def get_deliverability_metrics() -> str:
    """Get fleet health metrics: connected inboxes, daily sending limits, hourly pacing, and capacity analysis for 500 emails/day."""
    async with AsyncSessionLocal() as db:
        metrics = await deliverability_governor.compute_fleet_metrics(db)
        return json.dumps(metrics, indent=2)


@outreach_mcp.tool()
async def run_autonomous_pipeline(
    campaign_id: int,
    csv_content: str,
    custom_instructions: str = "",
    auto_approve: bool = False,
) -> str:
    """Run the complete pipeline: import CSV, research news & Reddit, draft emails, and prepare dispatch queue."""
    result = await pipeline_coordinator.run_full_pipeline(
        campaign_id=campaign_id,
        csv_content=csv_content,
        custom_instructions=custom_instructions,
        auto_approve=auto_approve,
    )
    return json.dumps(result, indent=2)
