"""Company lead clustering, role classification, and domain stagger resolution."""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Optional, Tuple
from urllib.parse import urlparse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import Company, Lead, QueueSlot

PUBLIC_EMAIL_DOMAINS = {
    "gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com",
    "icloud.com", "proton.me", "protonmail.com", "aol.com", "zoho.com",
}


def normalize_domain(input_str: Optional[str]) -> str:
    """Extract a clean base domain from an email, URL, or domain string."""
    if not input_str:
        return ""
    s = input_str.strip().lower()
    
    # If email address
    if "@" in s:
        parts = s.split("@")
        s = parts[-1].strip()
    
    # Strip protocol and slashes
    if "://" in s:
        parsed = urlparse(s)
        s = parsed.netloc or parsed.path
    
    s = s.split("/")[0].split("?")[0].strip()
    if s.startswith("www."):
        s = s[4:]
    return s


def normalize_company_name(raw_name: Optional[str], domain: Optional[str] = None) -> str:
    """Clean company name by removing legal suffixes and formatting."""
    if not raw_name:
        if domain and domain not in PUBLIC_EMAIL_DOMAINS:
            # Fall back to root domain name
            root = domain.split(".")[0]
            return root.capitalize()
        return "the team"
    
    name = raw_name.strip()
    # Strip common corporate suffixes
    name = re.sub(
        r",?\s+(inc\.?|llc\.?|ltd\.?|corp\.?|corporation|technologies|group|company|co\.?)$",
        "",
        name,
        flags=re.IGNORECASE,
    ).strip()
    return name or "the team"


def classify_role(role_title: Optional[str]) -> Tuple[str, int]:
    """Classify role category and seniority rank (1=C-suite/Founder to 4=IC).

    Returns:
        (category, seniority_rank)
        Categories: "executive", "technical", "growth", "operations", "general"
        Ranks: 1 (Founder/C-Suite), 2 (VP/Head/Director), 3 (Manager/Lead), 4 (Specialist/IC)
    """
    if not role_title:
        return "general", 3
    
    t = role_title.lower().strip()
    
    # Seniority
    if any(k in t for k in ["founder", "ceo", "chief executive", "owner", "president", "managing director"]):
        return "executive", 1
    elif any(k in t for k in ["cto", "chief technology", "chief architect"]):
        return "technical", 1
    elif any(k in t for k in ["cmo", "chief marketing", "cro", "chief revenue"]):
        return "growth", 1
    elif any(k in t for k in ["coo", "chief operating", "cfo"]):
        return "operations", 1
    
    # Rank 2: VP / Head / Director
    if any(k in t for k in ["vp", "vice president", "head of", "director"]):
        if any(k in t for k in ["tech", "eng", "software", "product", "dev", "data", "infrastructure"]):
            return "technical", 2
        elif any(k in t for k in ["growth", "sales", "marketing", "revenue", "partnerships", "success"]):
            return "growth", 2
        elif any(k in t for k in ["ops", "operations", "finance", "people", "talent"]):
            return "operations", 2
        return "executive", 2
    
    # Rank 3: Lead / Manager
    if any(k in t for k in ["lead", "manager", "principal"]):
        if any(k in t for k in ["tech", "eng", "software", "product", "dev", "data"]):
            return "technical", 3
        elif any(k in t for k in ["growth", "sales", "marketing"]):
            return "growth", 3
        return "general", 3
    
    # Rank 4: Specialist / Engineer / IC
    if any(k in t for k in ["engineer", "developer", "specialist", "analyst", "designer", "consultant"]):
        if any(k in t for k in ["engineer", "developer", "architect"]):
            return "technical", 4
        return "general", 4

    return "general", 3


async def get_or_create_company(
    db: AsyncSession,
    name: Optional[str],
    domain: Optional[str],
    website: Optional[str] = None,
    location: Optional[str] = None,
) -> Company:
    """Find existing company by domain or normalized name, or create a new entry."""
    clean_domain = normalize_domain(domain or website)
    clean_name = normalize_company_name(name, clean_domain)
    
    company = None
    if clean_domain and clean_domain not in PUBLIC_EMAIL_DOMAINS:
        stmt = select(Company).where(Company.domain == clean_domain)
        result = await db.execute(stmt)
        company = result.scalar_one_or_none()
    
    if not company and clean_name:
        stmt = select(Company).where(func.lower(Company.name) == clean_name.lower())
        result = await db.execute(stmt)
        company = result.scalar_one_or_none()
    
    if not company:
        effective_domain = clean_domain if (clean_domain and clean_domain not in PUBLIC_EMAIL_DOMAINS) else f"{re.sub(r'[^a-z0-9]', '', clean_name.lower())}.internal"
        company = Company(
            domain=effective_domain,
            name=clean_name,
            website=website or (f"https://{clean_domain}" if clean_domain else None),
            location=location,
        )
        db.add(company)
        await db.commit()
        await db.refresh(company)
        
    return company


async def calculate_company_stagger_offset(
    db: AsyncSession,
    company_id: int,
    base_scheduled_at: datetime,
    stagger_hours: int = 24,
) -> datetime:
    """Ensure contacts at the same company are staggered by stagger_hours.

    Checks the latest scheduled or sent date for any contact from this company.
    If a previous contact is scheduled on Day X, this contact moves to Day X + stagger_hours.
    """
    # Find latest scheduled time for any lead in this company
    stmt = (
        select(func.max(QueueSlot.scheduled_at))
        .join(Lead, QueueSlot.lead_id == Lead.id)
        .where(
            Lead.company_id == company_id,
            QueueSlot.status.in_(["pending", "in_flight", "sent"]),
        )
    )
    result = await db.execute(stmt)
    latest_slot = result.scalar_one_or_none()
    
    if latest_slot and latest_slot >= base_scheduled_at:
        # Move forward by stagger_hours
        return latest_slot + timedelta(hours=stagger_hours)
    
    return base_scheduled_at
