"""FastAPI Application Server for Outreach ENGINE.

Mounts REST APIs, FastMCP endpoint (/api/mcp), background deliverability scheduler,
and static frontend dashboard.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, date
from pathlib import Path
from typing import Any, List, Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from backend.database import get_db, init_db, AsyncSessionLocal
from backend.deliverability import deliverability_governor
from backend.email_dispatcher import email_dispatcher, get_secure_ssl_context
from backend.mcp_server import outreach_mcp
from backend.models import Campaign, Company, Draft, Inbox, Lead, QueueSlot, SendLog
from backend.pipeline import pipeline_coordinator
from backend.research_engine import research_engine
from backend.ai_writer import ai_writer
from backend.schemas import (
    CampaignCreate,
    CampaignOut,
    CampaignUpdate,
    ChatInstructionRequest,
    CompanyOut,
    DeliverabilityMetricsOut,
    DraftOut,
    DraftUpdate,
    InboxCreate,
    InboxOut,
    InboxUpdate,
    LeadOut,
    PipelineRunRequest,
    QueueSlotOut,
)

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

scheduler = AsyncIOScheduler()


async def scheduled_dispatch_job():
    """Periodic dispatcher running every 30s to release due emails according to time slots."""
    try:
        sent = await email_dispatcher.dispatch_due_slots()
        if sent > 0:
            print(f"[{datetime.utcnow().strftime('%H:%M:%S')}] Dispatched {sent} due emails.")
    except Exception as e:
        print(f"Error in background dispatch job: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite database schema
    await init_db()
    print("Database tables initialized.")

    # Create default demo campaign & default demo inboxes if empty
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(Campaign))
        if not res.scalars().first():
            default_campaign = Campaign(
                name="AI Automated Cold Outreach",
                offer_pitch="We provide high-leverage AI autonomous workflows that handle data enrichment and custom outreach.",
                sender_name="Outreach Engine",
                custom_instructions="Congratulate on milestones < 30 days. Emphasize zero-slop peer-to-peer style.",
                target_daily_sends=500,
            )
            db.add(default_campaign)
            await db.commit()

        # Seed sample inboxes for personal Gmail rotation pool
        res_ib = await db.execute(select(Inbox))
        if not res_ib.scalars().first():
            demo_inboxes = [
                Inbox(
                    email="alex.growth.outreach1@gmail.com",
                    display_name="Alex Rivera",
                    inbox_type="gmail_app_password",
                    daily_limit=35,
                    hourly_limit=5,
                    min_delay_seconds=90,
                    max_delay_seconds=240,
                    warmup_enabled=True,
                    warmup_current_limit=15,
                ),
                Inbox(
                    email="sarah.partnerships.team@gmail.com",
                    display_name="Sarah Chen",
                    inbox_type="gmail_app_password",
                    daily_limit=35,
                    hourly_limit=5,
                    min_delay_seconds=90,
                    max_delay_seconds=240,
                    warmup_enabled=True,
                    warmup_current_limit=20,
                ),
                Inbox(
                    email="marcus.enterprise.eng@gmail.com",
                    display_name="Marcus Vance",
                    inbox_type="gmail_app_password",
                    daily_limit=35,
                    hourly_limit=5,
                    min_delay_seconds=90,
                    max_delay_seconds=240,
                    warmup_enabled=True,
                    warmup_current_limit=25,
                ),
            ]
            db.add_all(demo_inboxes)
            await db.commit()

    # Start background scheduler
    scheduler.add_job(scheduled_dispatch_job, "interval", seconds=30)
    scheduler.start()
    print("Anti-spam deliverability scheduler started.")

    yield

    scheduler.shutdown()
    print("Scheduler stopped.")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Mount FastMCP streamable HTTP app at /api/mcp ─────────────────────────────
app.mount("/api/mcp", outreach_mcp.streamable_http_app())


# ── Health & Metrics ─────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "online",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "mcp_url": f"{settings.BASE_URL}/api/mcp",
    }


@app.get("/api/deliverability/metrics", response_model=DeliverabilityMetricsOut)
async def get_deliverability_metrics(db: AsyncSession = Depends(get_db)):
    """Fetch live fleet capacity, anti-spam limits, and target analysis."""
    metrics = await deliverability_governor.compute_fleet_metrics(db)
    return metrics


# ── Campaigns ────────────────────────────────────────────────────────────────

@app.get("/api/campaigns", response_model=List[CampaignOut])
async def list_campaigns(db: AsyncSession = Depends(get_db)):
    stmt = select(Campaign).order_by(Campaign.id.desc())
    res = await db.execute(stmt)
    campaigns = res.scalars().all()
    out = []
    for c in campaigns:
        # Lead counts
        l_cnt = await db.execute(select(func.count(Lead.id)).where(Lead.campaign_id == c.id))
        d_cnt = await db.execute(select(func.count(Draft.id)).join(Lead, Draft.lead_id == Lead.id).where(Lead.campaign_id == c.id))
        s_cnt = await db.execute(select(func.count(QueueSlot.id)).where(and_(QueueSlot.campaign_id == c.id, QueueSlot.status == "sent")))
        item = CampaignOut.model_validate(c)
        item.lead_count = l_cnt.scalar_one()
        item.draft_count = d_cnt.scalar_one()
        item.sent_count = s_cnt.scalar_one()
        out.append(item)
    return out


@app.post("/api/campaigns", response_model=CampaignOut)
async def create_campaign(req: CampaignCreate, db: AsyncSession = Depends(get_db)):
    camp = Campaign(
        name=req.name,
        offer_pitch=req.offer_pitch,
        sender_name=req.sender_name,
        custom_instructions=req.custom_instructions or "",
        target_daily_sends=req.target_daily_sends,
    )
    db.add(camp)
    await db.commit()
    await db.refresh(camp)
    return CampaignOut.model_validate(camp)


@app.patch("/api/campaigns/{campaign_id}", response_model=CampaignOut)
async def update_campaign(campaign_id: int, req: CampaignUpdate, db: AsyncSession = Depends(get_db)):
    stmt = select(Campaign).where(Campaign.id == campaign_id)
    res = await db.execute(stmt)
    camp = res.scalar_one_or_none()
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")

    for k, v in req.model_dump(exclude_unset=True).items():
        setattr(camp, k, v)
    await db.commit()
    await db.refresh(camp)
    return CampaignOut.model_validate(camp)


# ── Chat Instructions Interface ──────────────────────────────────────────────

@app.post("/api/chat-instruction")
async def post_chat_instruction(req: ChatInstructionRequest, db: AsyncSession = Depends(get_db)):
    """Apply specific prompts or tone instructions from the chat interface."""
    target_id = req.campaign_id
    if not target_id:
        res = await db.execute(select(Campaign).limit(1))
        camp = res.scalars().first()
        if camp:
            target_id = camp.id

    if not target_id:
        raise HTTPException(status_code=400, detail="No campaign specified")

    res = await db.execute(select(Campaign).where(Campaign.id == target_id))
    camp = res.scalar_one_or_none()
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Append or update instruction
    current = camp.custom_instructions or ""
    updated = f"{current}\n- {req.instruction}".strip() if current else req.instruction
    camp.custom_instructions = updated
    await db.commit()

    return {
        "status": "applied",
        "campaign_id": camp.id,
        "active_instructions": camp.custom_instructions,
    }


# ── Leads & CSV Upload ───────────────────────────────────────────────────────

@app.get("/api/leads", response_model=List[LeadOut])
async def list_leads_api(
    campaign_id: Optional[int] = None,
    company_id: Optional[int] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Lead).order_by(Lead.id.desc())
    conditions = []
    if campaign_id:
        conditions.append(Lead.campaign_id == campaign_id)
    if company_id:
        conditions.append(Lead.company_id == company_id)
    if status:
        conditions.append(Lead.status == status)

    if conditions:
        stmt = stmt.where(and_(*conditions))

    res = await db.execute(stmt)
    leads = res.scalars().all()

    out = []
    for l in leads:
        stmt_c = select(Company).where(Company.id == l.company_id)
        c_res = await db.execute(stmt_c)
        comp = c_res.scalar_one_or_none()

        stmt_d = select(Draft).where(Draft.lead_id == l.id)
        d_res = await db.execute(stmt_d)
        draft = d_res.scalar_one_or_none()

        item = LeadOut.model_validate(l)
        if comp:
            item.company = CompanyOut.model_validate(comp)
        if draft:
            item.draft = DraftOut.model_validate(draft)
        out.append(item)

    return out


@app.post("/api/leads/upload-csv")
async def upload_csv_endpoint(
    campaign_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    csv_text = content.decode("utf-8", errors="ignore")
    result = await pipeline_coordinator.ingest_csv(db, campaign_id, csv_text)
    return result


@app.post("/api/leads/{lead_id}/research")
async def trigger_lead_research(lead_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Lead).where(Lead.id == lead_id)
    res = await db.execute(stmt)
    lead = res.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    stmt_c = select(Company).where(Company.id == lead.company_id)
    c_res = await db.execute(stmt_c)
    company = c_res.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=400, detail="Company not resolved for lead")

    dossier = await research_engine.build_dossier(lead, company)
    lead.research_dossier = dossier
    lead.status = "researched"
    await db.commit()

    return {"status": "researched", "lead_id": lead.id, "dossier": dossier}


@app.post("/api/leads/{lead_id}/draft")
async def trigger_lead_draft(lead_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Lead).where(Lead.id == lead_id)
    res = await db.execute(stmt)
    lead = res.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    stmt_camp = select(Campaign).where(Campaign.id == lead.campaign_id)
    camp_res = await db.execute(stmt_camp)
    campaign = camp_res.scalar_one_or_none()

    stmt_c = select(Company).where(Company.id == lead.company_id)
    c_res = await db.execute(stmt_c)
    company = c_res.scalar_one_or_none()

    dossier = lead.research_dossier or await research_engine.build_dossier(lead, company)
    subject, body, raw = await ai_writer.generate_draft(lead, company, campaign, dossier)

    stmt_d = select(Draft).where(Draft.lead_id == lead.id)
    d_res = await db.execute(stmt_d)
    draft = d_res.scalar_one_or_none()

    recent = dossier.get("recent_achievement", {})
    reddit = dossier.get("reddit_insights", {})

    if draft:
        draft.subject = subject
        draft.body = body
        draft.recent_win_highlight = recent.get("summary")
        draft.reddit_context_used = reddit.get("pain_point")
    else:
        draft = Draft(
            lead_id=lead.id,
            subject=subject,
            body=body,
            recent_win_highlight=recent.get("summary"),
            reddit_context_used=reddit.get("pain_point"),
            role_tailored_angle=lead.role_category,
        )
        db.add(draft)

    lead.status = "drafted"
    await db.commit()

    return {"status": "drafted", "lead_id": lead.id, "subject": subject, "body": body}


@app.patch("/api/leads/{lead_id}/draft")
async def update_or_approve_draft(
    lead_id: int,
    req: DraftUpdate,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Draft).where(Draft.lead_id == lead_id)
    res = await db.execute(stmt)
    draft = res.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    draft.subject = req.subject
    draft.body = req.body
    if req.is_approved is not None:
        draft.is_approved = req.is_approved
        if req.is_approved:
            draft.approved_at = datetime.utcnow()
            stmt_lead = select(Lead).where(Lead.id == lead_id)
            l_res = await db.execute(stmt_lead)
            l = l_res.scalar_one_or_none()
            if l:
                l.status = "approved"

    await db.commit()
    return {"status": "updated", "is_approved": draft.is_approved}


# ── Companies ────────────────────────────────────────────────────────────────

@app.get("/api/companies", response_model=List[CompanyOut])
async def list_companies_api(db: AsyncSession = Depends(get_db)):
    stmt = select(Company).order_by(Company.id.desc())
    res = await db.execute(stmt)
    companies = res.scalars().all()
    return [CompanyOut.model_validate(c) for c in companies]


# ── Inboxes & Deliverability Control ─────────────────────────────────────────

@app.get("/api/inboxes", response_model=List[InboxOut])
async def list_inboxes_api(db: AsyncSession = Depends(get_db)):
    stmt = select(Inbox).order_by(Inbox.id.asc())
    res = await db.execute(stmt)
    return [InboxOut.model_validate(i) for i in res.scalars().all()]


@app.post("/api/inboxes", response_model=InboxOut)
async def create_inbox_api(req: InboxCreate, db: AsyncSession = Depends(get_db)):
    inbox = Inbox(
        email=req.email.strip().lower(),
        display_name=req.display_name,
        inbox_type=req.inbox_type,
        app_password=req.app_password,
        daily_limit=req.daily_limit,
        hourly_limit=req.hourly_limit,
        min_delay_seconds=req.min_delay_seconds,
        max_delay_seconds=req.max_delay_seconds,
        warmup_enabled=req.warmup_enabled,
    )
    db.add(inbox)
    await db.commit()
    await db.refresh(inbox)
    return InboxOut.model_validate(inbox)


@app.patch("/api/inboxes/{inbox_id}", response_model=InboxOut)
async def update_inbox_api(inbox_id: int, req: InboxUpdate, db: AsyncSession = Depends(get_db)):
    stmt = select(Inbox).where(Inbox.id == inbox_id)
    res = await db.execute(stmt)
    inbox = res.scalar_one_or_none()
    if not inbox:
        raise HTTPException(status_code=404, detail="Inbox not found")

    for k, v in req.model_dump(exclude_unset=True).items():
        setattr(inbox, k, v)
    await db.commit()
    await db.refresh(inbox)
    return InboxOut.model_validate(inbox)


@app.delete("/api/inboxes/{inbox_id}")
async def delete_inbox_api(inbox_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Inbox).where(Inbox.id == inbox_id)
    res = await db.execute(stmt)
    inbox = res.scalar_one_or_none()
    if not inbox:
        raise HTTPException(status_code=404, detail="Inbox not found")
    await db.delete(inbox)
    await db.commit()
    return {"status": "deleted"}


@app.post("/api/inboxes/{inbox_id}/test")
async def test_inbox_connection(inbox_id: int, db: AsyncSession = Depends(get_db)):
    """Test live authentication with Google SMTP servers using TLS and App Password."""
    stmt = select(Inbox).where(Inbox.id == inbox_id)
    res = await db.execute(stmt)
    inbox = res.scalar_one_or_none()
    if not inbox:
        raise HTTPException(status_code=404, detail="Inbox not found")

    if not inbox.app_password:
        return {
            "status": "simulated",
            "message": f"Demo inbox ({inbox.email}) is active in safe simulation mode. To dispatch live emails through Google, add a 16-character App Password.",
            "is_authenticated": True,
        }

    import smtplib
    try:
        context = get_secure_ssl_context()
        with smtplib.SMTP(inbox.smtp_host, inbox.smtp_port, timeout=12) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            server.login(inbox.email, inbox.app_password)
        inbox.is_quarantined = False
        inbox.last_error = None
        await db.commit()
        return {
            "status": "authenticated",
            "message": f"Authenticated with Google servers. Ready for protected delivery.",
            "is_authenticated": True,
        }
    except smtplib.SMTPAuthenticationError as e:
        inbox.is_quarantined = True
        inbox.last_error = f"Authentication error: {e}"
        await db.commit()
        return {
            "status": "error",
            "message": "Google authentication failed. Please verify 2-Step Verification is enabled and use a 16-character Google App Password (myaccount.google.com/apppasswords).",
            "is_authenticated": False,
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Connection check failed: {str(e)}",
            "is_authenticated": False,
        }


@app.delete("/api/campaigns/{campaign_id}/leads")
async def clear_campaign_leads(campaign_id: int, db: AsyncSession = Depends(get_db)):
    """Clear all leads, drafts, and queue slots for a clean new CSV import."""
    from backend.models import Lead, QueueSlot, Draft
    await db.execute(QueueSlot.__table__.delete().where(QueueSlot.campaign_id == campaign_id))
    await db.execute(Draft.__table__.delete().where(Draft.lead_id.in_(select(Lead.id).where(Lead.campaign_id == campaign_id))))
    await db.execute(Lead.__table__.delete().where(Lead.campaign_id == campaign_id))
    await db.commit()
    return {"status": "cleared"}


# ── Pipeline & Queue ─────────────────────────────────────────────────────────

@app.post("/api/pipeline/run-all")
async def run_pipeline_api(req: PipelineRunRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    """Run research, drafting, and scheduling for all leads in a campaign."""
    researched = await pipeline_coordinator.run_research_step(db, req.campaign_id)
    drafted = await pipeline_coordinator.run_drafting_step(db, req.campaign_id)
    scheduled = 0
    if req.schedule_immediately:
        scheduled = await pipeline_coordinator.run_scheduling_step(db, req.campaign_id, auto_approve=req.auto_approve)

    return {
        "status": "success",
        "researched_count": researched,
        "drafted_count": drafted,
        "scheduled_count": scheduled,
    }


@app.get("/api/queue", response_model=List[QueueSlotOut])
async def list_queue_slots(campaign_id: Optional[int] = None, db: AsyncSession = Depends(get_db)):
    stmt = select(QueueSlot).order_by(QueueSlot.scheduled_at.asc()).limit(100)
    if campaign_id:
        stmt = stmt.where(QueueSlot.campaign_id == campaign_id)
    res = await db.execute(stmt)
    slots = res.scalars().all()

    out = []
    for s in slots:
        l_res = await db.execute(select(Lead).where(Lead.id == s.lead_id))
        lead = l_res.scalar_one_or_none()

        ib_res = await db.execute(select(Inbox).where(Inbox.id == s.inbox_id))
        inbox = ib_res.scalar_one_or_none()

        item = QueueSlotOut.model_validate(s)
        item.lead_name = lead.full_name if lead else None
        item.lead_email = lead.email if lead else None
        item.inbox_email = inbox.email if inbox else None
        out.append(item)
    return out


# ── Static UI Mounting ───────────────────────────────────────────────────────

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

@app.get("/")
async def serve_index():
    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "Outreach ENGINE backend active. Frontend building..."}
