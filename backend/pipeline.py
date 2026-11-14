"""End-to-end Autonomous Pipeline Coordinator.

Orchestrates CSV ingestion -> Company clustering -> Deep Internet/Reddit Research ->
Anti-slop AI Drafting -> Deliverability Scheduling across connected Gmail inboxes.
"""

from __future__ import annotations

import csv
import io
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from backend.company_clustering import (
    classify_role,
    get_or_create_company,
    normalize_domain,
)
from backend.database import AsyncSessionLocal
from backend.deliverability import deliverability_governor
from backend.models import Campaign, Company, Draft, Lead, QueueSlot
from backend.research_engine import research_engine
from backend.ai_writer import ai_writer

logger = logging.getLogger("outreach_engine.pipeline")


class PipelineCoordinator:

    async def ingest_csv(
        self,
        db: AsyncSession,
        campaign_id: int,
        csv_content: str,
    ) -> Dict[str, Any]:
        """Parse CSV, normalize contacts, cluster by company, and classify roles."""
        f = io.StringIO(csv_content.strip())
        reader = csv.DictReader(f)
        
        imported_count = 0
        skipped_count = 0
        companies_seen = set()

        for row in reader:
            # Map flexible headers
            email_val = row.get("email") or row.get("emails") or row.get("email_address") or ""
            email_val = email_val.strip().lower()
            if not email_val or "@" not in email_val:
                skipped_count += 1
                continue

            # Check for existing lead with this email
            stmt_existing = select(Lead).where(Lead.email == email_val)
            res_existing = await db.execute(stmt_existing)
            if res_existing.scalar_one_or_none():
                skipped_count += 1
                continue

            # Parse Name
            first_name = row.get("first_name") or ""
            last_name = row.get("last_name") or ""
            full_name = row.get("name") or row.get("full_name") or f"{first_name} {last_name}".strip()
            if not first_name and full_name:
                first_name = full_name.split()[0]

            # Parse Company & Domain
            company_raw = row.get("company") or row.get("company_name") or row.get("business_name") or ""
            website = row.get("website") or row.get("company_url") or ""
            role_title = row.get("role_title") or row.get("role") or row.get("post") or row.get("title") or ""
            location = row.get("location") or row.get("city") or ""
            linkedin = row.get("linkedin") or row.get("linkedin_url") or ""

            # Extract or resolve company
            company = await get_or_create_company(
                db=db,
                name=company_raw,
                domain=website or email_val,
                website=website,
                location=location,
            )
            companies_seen.add(company.id)

            # Classify role
            category, seniority = classify_role(role_title)

            lead = Lead(
                campaign_id=campaign_id,
                company_id=company.id,
                email=email_val,
                first_name=first_name,
                last_name=last_name,
                full_name=full_name or first_name,
                role_title=role_title,
                role_category=category,
                seniority_rank=seniority,
                linkedin_url=linkedin,
                location=location,
                status="imported",
            )
            db.add(lead)
            imported_count += 1

        await db.commit()
        return {
            "imported_leads": imported_count,
            "skipped_leads": skipped_count,
            "unique_companies": len(companies_seen),
        }

    async def run_research_step(
        self,
        db: AsyncSession,
        campaign_id: int,
        lead_ids: Optional[List[int]] = None,
    ) -> int:
        """Run deep web search & Reddit research for leads."""
        stmt = (
            select(Lead)
            .where(
                and_(
                    Lead.campaign_id == campaign_id,
                    Lead.status == "imported" if not lead_ids else Lead.id.in_(lead_ids),
                )
            )
        )
        res = await db.execute(stmt)
        leads = list(res.scalars().all())

        count = 0
        for lead in leads:
            stmt_comp = select(Company).where(Company.id == lead.company_id)
            comp_res = await db.execute(stmt_comp)
            company = comp_res.scalar_one_or_none()
            if not company:
                continue

            # Build comprehensive dossier
            dossier = await research_engine.build_dossier(lead, company)
            lead.research_dossier = dossier
            lead.status = "researched"
            count += 1

        await db.commit()
        return count

    async def run_drafting_step(
        self,
        db: AsyncSession,
        campaign_id: int,
        custom_instructions: Optional[str] = None,
        lead_ids: Optional[List[int]] = None,
    ) -> int:
        """Generate anti-slop personalized emails based on research dossiers."""
        stmt_camp = select(Campaign).where(Campaign.id == campaign_id)
        camp_res = await db.execute(stmt_camp)
        campaign = camp_res.scalar_one_or_none()
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        stmt = (
            select(Lead)
            .where(
                and_(
                    Lead.campaign_id == campaign_id,
                    Lead.status == "researched" if not lead_ids else Lead.id.in_(lead_ids),
                )
            )
        )
        res = await db.execute(stmt)
        leads = list(res.scalars().all())

        drafted_count = 0
        for lead in leads:
            stmt_comp = select(Company).where(Company.id == lead.company_id)
            comp_res = await db.execute(stmt_comp)
            company = comp_res.scalar_one_or_none()
            if not company:
                continue

            dossier = lead.research_dossier or {}
            subject, body, raw_data = await ai_writer.generate_draft(
                lead=lead,
                company=company,
                campaign=campaign,
                dossier=dossier,
                custom_instructions=custom_instructions,
            )

            # Check if draft already exists
            stmt_draft = select(Draft).where(Draft.lead_id == lead.id)
            d_res = await db.execute(stmt_draft)
            existing_draft = d_res.scalar_one_or_none()

            recent = dossier.get("recent_achievement", {})
            reddit = dossier.get("reddit_insights", {})

            if existing_draft:
                existing_draft.subject = subject
                existing_draft.body = body
                existing_draft.recent_win_highlight = recent.get("summary")
                existing_draft.reddit_context_used = reddit.get("pain_point")
                existing_draft.role_tailored_angle = lead.role_category
            else:
                new_draft = Draft(
                    lead_id=lead.id,
                    subject=subject,
                    body=body,
                    recent_win_highlight=recent.get("summary"),
                    reddit_context_used=reddit.get("pain_point"),
                    role_tailored_angle=lead.role_category,
                    is_approved=False,
                )
                db.add(new_draft)

            lead.status = "drafted"
            drafted_count += 1

        await db.commit()
        return drafted_count

    async def run_scheduling_step(
        self,
        db: AsyncSession,
        campaign_id: int,
        auto_approve: bool = False,
    ) -> int:
        """Schedule approved leads across connected Gmail accounts."""
        # Find leads ready to schedule
        if auto_approve:
            stmt_drafts = (
                select(Draft)
                .join(Lead, Draft.lead_id == Lead.id)
                .where(
                    and_(
                        Lead.campaign_id == campaign_id,
                        Lead.status == "drafted",
                    )
                )
            )
            d_res = await db.execute(stmt_drafts)
            for d in d_res.scalars().all():
                d.is_approved = True
                d.approved_at = datetime.utcnow()
            await db.commit()

        # Query approved leads that have drafts
        stmt_leads = (
            select(Lead)
            .join(Draft, Lead.id == Draft.lead_id)
            .where(
                and_(
                    Lead.campaign_id == campaign_id,
                    Draft.is_approved == True,
                    Lead.status.in_(["drafted", "approved"]),
                )
            )
            .order_by(Lead.seniority_rank.asc())  # Schedule C-Suite/VP first
        )
        res = await db.execute(stmt_leads)
        approved_leads = list(res.scalars().all())

        if not approved_leads:
            return 0

        slots = await deliverability_governor.schedule_campaign_leads(
            db=db,
            campaign_id=campaign_id,
            approved_leads=approved_leads,
        )
        return len(slots)

    async def run_full_pipeline(
        self,
        campaign_id: int,
        csv_content: str,
        custom_instructions: Optional[str] = None,
        auto_approve: bool = False,
    ) -> Dict[str, Any]:
        """Execute the entire automated pipeline from end to end."""
        async with AsyncSessionLocal() as db:
            # 1. Ingest
            ingest_result = await self.ingest_csv(db, campaign_id, csv_content)

            # 2. Deep Research
            researched_count = await self.run_research_step(db, campaign_id)

            # 3. AI Drafting
            drafted_count = await self.run_drafting_step(
                db, campaign_id, custom_instructions=custom_instructions
            )

            # 4. Scheduling (if auto_approve is True and inboxes are present)
            scheduled_count = 0
            try:
                scheduled_count = await self.run_scheduling_step(
                    db, campaign_id, auto_approve=auto_approve
                )
            except Exception as e:
                logger.warning(f"Scheduling skipped or waiting for inbox connection: {e}")

            return {
                "ingest": ingest_result,
                "researched_leads": researched_count,
                "drafted_leads": drafted_count,
                "scheduled_slots": scheduled_count,
                "status": "ready_for_review" if not auto_approve else "scheduled",
            }


pipeline_coordinator = PipelineCoordinator()
