"""Pydantic schemas for request/response serialization."""

from __future__ import annotations

from datetime import datetime, date
from typing import Any, Optional
from pydantic import BaseModel, EmailStr, Field


# ── Campaign Schemas ─────────────────────────────────────────────────────────

class CampaignBase(BaseModel):
    name: str = Field(..., example="Q4 Enterprise AI Outreach")
    offer_pitch: str = Field(..., example="We help B2B tech teams automate cold outreach with human-level personalization.")
    sender_name: str = Field(default="Alex", example="Alex Rivera")
    custom_instructions: Optional[str] = Field(default="", example="Focus on AI integration ease, keep tone direct.")
    target_daily_sends: int = Field(default=500, example=500)


class CampaignCreate(CampaignBase):
    pass


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    offer_pitch: Optional[str] = None
    sender_name: Optional[str] = None
    custom_instructions: Optional[str] = None
    status: Optional[str] = None
    target_daily_sends: Optional[int] = None


class CampaignOut(CampaignBase):
    id: int
    status: str
    created_at: datetime
    updated_at: datetime
    lead_count: int = 0
    draft_count: int = 0
    sent_count: int = 0

    class Config:
        from_attributes = True


# ── Company Schemas ──────────────────────────────────────────────────────────

class CompanyOut(BaseModel):
    id: int
    domain: str
    name: str
    industry: Optional[str] = None
    website: Optional[str] = None
    location: Optional[str] = None
    has_recent_milestone: bool = False
    recent_milestone_summary: Optional[str] = None
    recent_news: list[dict[str, Any]] = []
    reddit_intel: dict[str, Any] = {}
    last_contacted_at: Optional[datetime] = None
    researched_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Lead & Draft Schemas ────────────────────────────────────────────────────

class DraftOut(BaseModel):
    id: int
    lead_id: int
    subject: str
    body: str
    recent_win_highlight: Optional[str] = None
    reddit_context_used: Optional[str] = None
    role_tailored_angle: Optional[str] = None
    is_approved: bool = False
    approved_at: Optional[datetime] = None
    updated_at: datetime

    class Config:
        from_attributes = True


class DraftUpdate(BaseModel):
    subject: str
    body: str
    is_approved: Optional[bool] = True


class LeadOut(BaseModel):
    id: int
    campaign_id: Optional[int] = None
    company_id: Optional[int] = None
    email: str
    first_name: str
    last_name: str
    full_name: str
    role_title: str
    role_category: str
    seniority_rank: int
    linkedin_url: str
    location: str
    status: str
    research_dossier: dict[str, Any] = {}
    company: Optional[CompanyOut] = None
    draft: Optional[DraftOut] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Inbox Schemas ────────────────────────────────────────────────────────────

class InboxCreate(BaseModel):
    email: str
    display_name: str = ""
    inbox_type: str = "gmail_app_password"  # gmail_app_password, gmail_oauth, smtp
    app_password: Optional[str] = None
    daily_limit: int = 35
    hourly_limit: int = 5
    min_delay_seconds: int = 90
    max_delay_seconds: int = 240
    warmup_enabled: bool = True


class InboxUpdate(BaseModel):
    display_name: Optional[str] = None
    app_password: Optional[str] = None
    daily_limit: Optional[int] = None
    hourly_limit: Optional[int] = None
    min_delay_seconds: Optional[int] = None
    max_delay_seconds: Optional[int] = None
    is_active: Optional[bool] = None
    is_quarantined: Optional[bool] = None
    warmup_enabled: Optional[bool] = None


class InboxOut(BaseModel):
    id: int
    email: str
    display_name: str
    inbox_type: str
    daily_limit: int
    hourly_limit: int
    min_delay_seconds: int
    max_delay_seconds: int
    warmup_enabled: bool
    warmup_current_limit: int
    is_active: bool
    is_quarantined: bool
    last_error: Optional[str] = None
    last_sent_at: Optional[datetime] = None
    sent_today_count: int
    sent_this_hour_count: int

    class Config:
        from_attributes = True


# ── Queue & Deliverability Metrics ──────────────────────────────────────────

class QueueSlotOut(BaseModel):
    id: int
    campaign_id: int
    lead_id: int
    inbox_id: Optional[int] = None
    scheduled_at: datetime
    status: str
    error_message: Optional[str] = None
    sent_at: Optional[datetime] = None
    lead_name: Optional[str] = None
    lead_email: Optional[str] = None
    inbox_email: Optional[str] = None

    class Config:
        from_attributes = True


class DeliverabilityMetricsOut(BaseModel):
    total_inboxes: int
    active_inboxes: int
    quarantined_inboxes: int
    total_fleet_daily_capacity: int  # Sum of active inboxes' daily limits
    target_daily_sends: int          # E.g., 500 emails/day
    recommended_inboxes_needed: int  # target / 35
    fleet_capacity_health_pct: float # (capacity / target) * 100
    sent_today_total: int
    sent_this_hour_total: int
    pending_queue_count: int
    average_jitter_seconds: int
    business_hours_window: str


# ── Action Requests ──────────────────────────────────────────────────────────

class ChatInstructionRequest(BaseModel):
    campaign_id: Optional[int] = None
    instruction: str


class PipelineRunRequest(BaseModel):
    campaign_id: int
    auto_approve: bool = False
    schedule_immediately: bool = True
