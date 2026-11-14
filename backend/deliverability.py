"""Deliverability Governor and Anti-Spam Scheduling Engine.

Calculates safe limits for personal Gmail accounts, distributes sends across
the inbox pool, spaces emails with human-like jitter, and respects business hours.
"""

from __future__ import annotations

import logging
import math
import random
from datetime import datetime, date, time, timedelta
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from backend.models import Campaign, Company, Inbox, Lead, QueueSlot, Reply, SendLog

logger = logging.getLogger("outreach_engine.deliverability")


class DeliverabilityGovernor:
    """Enforces mathematical limits so cold emails never trigger Gmail spam algorithms."""

    def __init__(self):
        self.daily_cap = settings.DEFAULT_DAILY_LIMIT_PER_INBOX
        self.hourly_cap = settings.DEFAULT_HOURLY_LIMIT_PER_INBOX
        self.min_jitter = settings.DEFAULT_MIN_JITTER_SECONDS
        self.max_jitter = settings.DEFAULT_MAX_JITTER_SECONDS

    def parse_time_str(self, time_str: str) -> time:
        parts = [int(p) for p in time_str.split(":")]
        return time(parts[0], parts[1])

    def is_within_business_hours(self, dt: datetime) -> bool:
        start_t = self.parse_time_str(settings.SENDING_HOURS_START)
        end_t = self.parse_time_str(settings.SENDING_HOURS_END)
        current_t = dt.time()

        if not settings.WEEKENDS_ENABLED and dt.weekday() >= 5:
            return False

        return start_t <= current_t <= end_t

    def get_next_business_slot(self, dt: datetime) -> datetime:
        """Advance dt to the next valid sending window if currently outside business hours."""
        start_t = self.parse_time_str(settings.SENDING_HOURS_START)
        end_t = self.parse_time_str(settings.SENDING_HOURS_END)

        candidate = dt
        # If weekend
        if not settings.WEEKENDS_ENABLED and candidate.weekday() >= 5:
            days_ahead = 7 - candidate.weekday()  # Days until Monday
            candidate = candidate.replace(hour=start_t.hour, minute=start_t.minute, second=0, microsecond=0) + timedelta(days=days_ahead)
            return candidate

        # If before start time today
        if candidate.time() < start_t:
            return candidate.replace(hour=start_t.hour, minute=start_t.minute, second=0, microsecond=0)

        # If after end time today, advance to tomorrow start
        if candidate.time() > end_t:
            tomorrow = candidate + timedelta(days=1)
            if not settings.WEEKENDS_ENABLED and tomorrow.weekday() >= 5:
                days_ahead = 7 - tomorrow.weekday()
                tomorrow = tomorrow + timedelta(days=days_ahead)
            return tomorrow.replace(hour=start_t.hour, minute=start_t.minute, second=0, microsecond=0)

        return candidate

    async def get_active_inboxes(self, db: AsyncSession) -> List[Inbox]:
        stmt = select(Inbox).where(
            and_(
                Inbox.is_active == True,
                Inbox.is_quarantined == False,
            )
        )
        res = await db.execute(stmt)
        return list(res.scalars().all())

    async def compute_fleet_metrics(self, db: AsyncSession, target_daily: int = 500) -> Dict[str, Any]:
        """Compute real-time capacity and recommendations for 500 emails/day."""
        inboxes = await self.get_active_inboxes(db)
        total_inboxes = len(inboxes)

        today = date.today()
        # Reset counters if new day
        for inbox in inboxes:
            if inbox.last_reset_date != today:
                inbox.sent_today_count = 0
                inbox.last_reset_date = today

        total_daily_capacity = sum(inbox.daily_limit for inbox in inboxes)
        total_hourly_capacity = sum(inbox.hourly_limit for inbox in inboxes)
        sent_today_total = sum(inbox.sent_today_count for inbox in inboxes)
        sent_this_hour_total = sum(inbox.sent_this_hour_count for inbox in inboxes)

        # Dynamic target calculation based on fleet limit or campaign target
        avg_cap = (total_daily_capacity / max(1, total_inboxes)) if total_inboxes > 0 else self.daily_cap
        needed_inboxes = math.ceil(target_daily / max(1, avg_cap))
        capacity_health = min(100.0, (total_daily_capacity / target_daily) * 100.0) if target_daily > 0 else 100.0

        # Pending slots in queue
        stmt_pending = select(func.count(QueueSlot.id)).where(QueueSlot.status == "pending")
        res_pending = await db.execute(stmt_pending)
        pending_count = res_pending.scalar_one()

        # All-time send and reply statistics
        stmt_sent_all = select(func.count(SendLog.id))
        res_sent_all = await db.execute(stmt_sent_all)
        total_sent_all = res_sent_all.scalar_one()

        stmt_replies = select(func.count(Reply.id))
        res_replies = await db.execute(stmt_replies)
        total_replies = res_replies.scalar_one()

        stmt_interested = select(func.count(Reply.id)).where(Reply.intent == "interested")
        res_interested = await db.execute(stmt_interested)
        interested_count = res_interested.scalar_one()

        stmt_leads_count = select(func.count(Lead.id))
        res_leads_count = await db.execute(stmt_leads_count)
        leads_count = res_leads_count.scalar_one()

        stmt_comp_count = select(func.count(Company.id))
        res_comp_count = await db.execute(stmt_comp_count)
        comp_count = res_comp_count.scalar_one()

        # Calculate accurate reply rate percentage
        reply_rate = round((total_replies / max(1, total_sent_all)) * 100.0, 1) if total_sent_all > 0 else 0.0

        return {
            "total_inboxes": total_inboxes,
            "active_inboxes": total_inboxes,
            "quarantined_inboxes": 0,
            "total_fleet_daily_capacity": total_daily_capacity,
            "total_fleet_hourly_capacity": total_hourly_capacity,
            "target_daily_sends": target_daily,
            "recommended_inboxes_needed": needed_inboxes,
            "fleet_capacity_health_pct": round(capacity_health, 1),
            "sent_today_total": sent_today_total,
            "sent_this_hour_total": sent_this_hour_total,
            "total_sent_all_time": total_sent_all,
            "total_replies_count": total_replies,
            "reply_rate_pct": reply_rate,
            "interested_replies_count": interested_count,
            "total_leads_count": leads_count,
            "total_companies_count": comp_count,
            "pending_queue_count": pending_count,
            "average_jitter_seconds": (self.min_jitter + self.max_jitter) // 2,
            "business_hours_window": f"{settings.SENDING_HOURS_START} - {settings.SENDING_HOURS_END} ({settings.SENDING_TIMEZONE})",
        }

    async def schedule_campaign_leads(
        self,
        db: AsyncSession,
        campaign_id: int,
        approved_leads: List[Lead],
    ) -> List[QueueSlot]:
        """Schedule approved leads across available inboxes with jitter and company staggering."""
        inboxes = await self.get_active_inboxes(db)
        if not inboxes:
            raise ValueError("No active sending inboxes connected. Please add at least 1 Gmail account.")

        created_slots = []
        now = datetime.utcnow()
        current_cursor = self.get_next_business_slot(now + timedelta(minutes=2))

        # Track last scheduled time per inbox
        inbox_last_slot: Dict[int, datetime] = {
            ib.id: current_cursor for ib in inboxes
        }
        # Track daily counts per inbox
        inbox_day_count: Dict[int, int] = {
            ib.id: ib.sent_today_count for ib in inboxes
        }

        # Track company domain scheduling to enforce staggering
        company_last_scheduled: Dict[int, datetime] = {}

        inbox_cycle_index = 0

        for lead in approved_leads:
            # Pick next available inbox that hasn't exceeded daily cap for the scheduled date
            inbox = inboxes[inbox_cycle_index % len(inboxes)]
            inbox_cycle_index += 1

            # Base time: previous slot for this inbox + randomized jitter
            jitter_seconds = random.randint(inbox.min_delay_seconds, inbox.max_delay_seconds)
            scheduled_time = inbox_last_slot[inbox.id] + timedelta(seconds=jitter_seconds)
            scheduled_time = self.get_next_business_slot(scheduled_time)

            # Company Staggering Rule:
            # If another contact at the same company is already scheduled, advance by at least 24 hours!
            if lead.company_id:
                if lead.company_id in company_last_scheduled:
                    prev_company_time = company_last_scheduled[lead.company_id]
                    stagger_target = prev_company_time + timedelta(hours=settings.COMPANY_STAGGER_HOURS)
                    if scheduled_time < stagger_target:
                        scheduled_time = self.get_next_business_slot(stagger_target)

            # Check if this inbox has reached its daily limit on that date
            if inbox_day_count[inbox.id] >= inbox.daily_limit:
                # Move to next calendar day
                next_day = scheduled_time + timedelta(days=1)
                scheduled_time = self.get_next_business_slot(next_day)
                inbox_day_count[inbox.id] = 0

            # Update tracking cursors
            inbox_last_slot[inbox.id] = scheduled_time
            inbox_day_count[inbox.id] += 1
            if lead.company_id:
                company_last_scheduled[lead.company_id] = scheduled_time

            # Create QueueSlot
            slot = QueueSlot(
                campaign_id=campaign_id,
                lead_id=lead.id,
                inbox_id=inbox.id,
                scheduled_at=scheduled_time,
                status="pending",
            )
            db.add(slot)
            lead.status = "scheduled"
            created_slots.append(slot)

        await db.commit()
        logger.info(f"Successfully scheduled {len(created_slots)} leads across {len(inboxes)} inboxes.")
        return created_slots


deliverability_governor = DeliverabilityGovernor()
