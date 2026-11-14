"""SQLAlchemy models for Outreach ENGINE."""

from __future__ import annotations

from datetime import datetime, date
from typing import Any
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from backend.database import Base


def utcnow() -> datetime:
    return datetime.utcnow()


class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    offer_pitch = Column(Text, nullable=False, default="")  # What we offer / value proposition
    sender_name = Column(String(255), nullable=False, default="Team")
    custom_instructions = Column(Text, nullable=True, default="")  # Custom user/chat instructions
    status = Column(String(50), default="active", nullable=False)  # active, paused, completed
    target_daily_sends = Column(Integer, default=500, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    leads = relationship("Lead", back_populates="campaign", cascade="all, delete-orphan")
    queue_slots = relationship("QueueSlot", back_populates="campaign", cascade="all, delete-orphan")


class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    domain = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    industry = Column(String(255), nullable=True)
    website = Column(String(512), nullable=True)
    location = Column(String(255), nullable=True)
    
    # Live Research Intel
    recent_news = Column(JSON, default=list)       # List of {headline, date, snippet, url, is_within_30_days}
    reddit_intel = Column(JSON, default=dict)     # {threads, pain_points, sentiment, quote}
    has_recent_milestone = Column(Boolean, default=False)
    recent_milestone_summary = Column(Text, nullable=True)
    
    # Staggering & deliverability guardrails
    last_contacted_at = Column(DateTime, nullable=True)  # Last time any person at this company received an email
    researched_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    leads = relationship("Lead", back_populates="company", cascade="all, delete-orphan")


class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="SET NULL"), nullable=True)

    email = Column(String(255), unique=True, index=True, nullable=False)
    first_name = Column(String(100), default="", nullable=False)
    last_name = Column(String(100), default="", nullable=False)
    full_name = Column(String(255), default="", nullable=False)
    role_title = Column(String(255), default="", nullable=False)  # e.g., VP of Engineering
    role_category = Column(String(50), default="general", nullable=False)  # executive, technical, growth, operations
    seniority_rank = Column(Integer, default=3, nullable=False)  # 1: C-Suite/Founder, 2: VP/Director, 3: Lead, 4: IC
    linkedin_url = Column(String(512), default="", nullable=False)
    location = Column(String(255), default="", nullable=False)

    # Pipeline Status: imported -> researched -> drafted -> approved -> scheduled -> sent -> replied / interested -> bounced
    status = Column(String(50), default="imported", nullable=False)
    research_dossier = Column(JSON, default=dict)  # Complete synthesized dossier
    notes = Column(Text, default="", nullable=False)

    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    campaign = relationship("Campaign", back_populates="leads")
    company = relationship("Company", back_populates="leads")
    draft = relationship("Draft", back_populates="lead", uselist=False, cascade="all, delete-orphan")
    queue_slots = relationship("QueueSlot", back_populates="lead", cascade="all, delete-orphan")
    replies = relationship("Reply", back_populates="lead", cascade="all, delete-orphan")


class Draft(Base):
    __tablename__ = "drafts"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), unique=True, nullable=False)
    
    subject = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    recent_win_highlight = Column(Text, nullable=True)
    reddit_context_used = Column(Text, nullable=True)
    role_tailored_angle = Column(Text, nullable=True)
    
    is_approved = Column(Boolean, default=False, nullable=False)
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    lead = relationship("Lead", back_populates="draft")


class Inbox(Base):
    __tablename__ = "inboxes"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    display_name = Column(String(255), default="", nullable=False)
    inbox_type = Column(String(50), default="gmail_app_password", nullable=False)  # gmail_app_password, gmail_oauth, smtp
    
    # Credentials
    app_password = Column(String(255), nullable=True)
    oauth_refresh_token = Column(Text, nullable=True)
    smtp_host = Column(String(255), default="smtp.gmail.com", nullable=False)
    smtp_port = Column(Integer, default=587, nullable=False)
    
    # Adjustable Anti-Spam Rate Limits (User configurable)
    daily_limit = Column(Integer, default=35, nullable=False)       # Safe daily limit per inbox
    hourly_limit = Column(Integer, default=5, nullable=False)       # Max sends per hour
    min_delay_seconds = Column(Integer, default=90, nullable=False) # Min gap between sends
    max_delay_seconds = Column(Integer, default=240, nullable=False)# Max gap between sends
    
    # Warmup automation
    warmup_enabled = Column(Boolean, default=True, nullable=False)
    warmup_current_limit = Column(Integer, default=8, nullable=False)
    warmup_step_per_day = Column(Integer, default=3, nullable=False)
    warmup_target = Column(Integer, default=35, nullable=False)

    # State & Health tracking
    is_active = Column(Boolean, default=True, nullable=False)
    is_quarantined = Column(Boolean, default=False, nullable=False)
    last_error = Column(Text, nullable=True)
    last_sent_at = Column(DateTime, nullable=True)
    sent_today_count = Column(Integer, default=0, nullable=False)
    sent_this_hour_count = Column(Integer, default=0, nullable=False)
    last_reset_date = Column(Date, default=date.today, nullable=False)
    last_reset_hour = Column(Integer, default=0, nullable=False)
    
    created_at = Column(DateTime, default=utcnow, nullable=False)

    queue_slots = relationship("QueueSlot", back_populates="inbox")


class QueueSlot(Base):
    __tablename__ = "queue_slots"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False)
    inbox_id = Column(Integer, ForeignKey("inboxes.id", ondelete="SET NULL"), nullable=True)

    scheduled_at = Column(DateTime, nullable=False, index=True)
    status = Column(String(50), default="pending", nullable=False, index=True)  # pending, in_flight, sent, failed, cancelled
    error_message = Column(Text, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    campaign = relationship("Campaign", back_populates="queue_slots")
    lead = relationship("Lead", back_populates="queue_slots")
    inbox = relationship("Inbox", back_populates="queue_slots")


class Reply(Base):
    __tablename__ = "replies"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False)
    inbox_id = Column(Integer, ForeignKey("inboxes.id", ondelete="SET NULL"), nullable=True)

    sender_email = Column(String(255), nullable=False)
    recipient_email = Column(String(255), nullable=False)
    subject = Column(String(255), default="", nullable=False)
    body = Column(Text, nullable=False)
    intent = Column(String(50), default="interested", nullable=False)  # interested, question, follow_up_requested, meeting_booked
    received_at = Column(DateTime, default=utcnow, nullable=False)
    is_replied_to = Column(Boolean, default=False, nullable=False)
    reply_back_body = Column(Text, nullable=True)

    lead = relationship("Lead", back_populates="replies")
    inbox = relationship("Inbox")


class SendLog(Base):
    __tablename__ = "send_logs"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, nullable=True)
    inbox_id = Column(Integer, nullable=True)
    recipient_email = Column(String(255), nullable=False)
    sender_email = Column(String(255), nullable=False)
    subject = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    sent_at = Column(DateTime, default=utcnow, nullable=False)
    status = Column(String(50), default="delivered", nullable=False)  # delivered, failed, simulated
    error_details = Column(Text, nullable=True)
    delivery_latency_ms = Column(Integer, default=0, nullable=False)
