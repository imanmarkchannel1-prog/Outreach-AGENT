"""Company lead clustering, role classification, and domain stagger resolution."""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import Company, Lead, QueueSlot

PUBLIC_EMAIL_DOMAINS = {
    "gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com",
    "icloud.com", "proton.me", "protonmail.com", "aol.com", "zoho.com",
}

# Fuzzy column pattern dictionaries for Agentic CSV Ingestion
COLUMN_ALIASES = {
    "email": [
        "email", "emails", "e-mail", "work email", "email address",
        "contact email", "primary email", "mail", "inbox"
    ],
    "full_name": [
        "name", "full name", "contact name", "prospect name", "lead name",
        "person", "founder name", "founder / exec"
    ],
    "first_name": [
        "first name", "first", "fname", "given name"
    ],
    "last_name": [
        "last name", "last", "lname", "surname", "family name"
    ],
    "company": [
        "company", "brand", "dtc brand", "business", "company name",
        "organization", "store", "store name", "brand name", "client"
    ],
    "role_title": [
        "role", "title", "position", "post", "designation", "job title",
        "headline", "occupation", "job role"
    ],
    "website": [
        "website", "url", "company url", "store url", "site", "domain",
        "link", "web", "shopify_url", "store_link"
    ],
    "location": [
        "location", "city", "country", "state", "address", "hq", "headquarters"
    ],
    "linkedin": [
        "linkedin", "linkedin url", "social", "profile", "linkedin profile"
    ],
}


def agentic_map_columns(headers: List[str]) -> Dict[str, str]:
    """Agentically maps messy or non-standard CSV headers to canonical fields."""
    normalized_headers = {h.strip().lower(): h for h in headers if h}
    mapping: Dict[str, str] = {}

    for canonical, aliases in COLUMN_ALIASES.items():
        matched_header = None
        # 1. Exact match
        for alias in aliases:
            if alias in normalized_headers:
                matched_header = normalized_headers[alias]
                break

        # 2. Substring match if no exact match
        if not matched_header:
            for h_norm, original in normalized_headers.items():
                if any(alias in h_norm for alias in aliases):
                    matched_header = original
                    break

        if matched_header:
            mapping[canonical] = matched_header

    return mapping


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
            root = domain.split(".")[0]
            return root.capitalize()
        return "the brand"
    
    name = raw_name.strip()
    name = re.sub(
        r",?\s+(inc\.?|llc\.?|ltd\.?|corp\.?|corporation|technologies|group|company|co\.?)$",
        "",
        name,
        flags=re.IGNORECASE,
    ).strip()
    return name or "the brand"


def classify_role(role_title: Optional[str], email: Optional[str] = None) -> Tuple[str, int, bool]:
    """Agentically classifies role category, seniority rank, and founder status.

    Returns:
        (category, seniority_rank, is_founder)
        Categories: "executive", "growth", "technical", "operations", "general"
        Ranks: 1 (Founder/CEO/C-Suite), 2 (VP/Head/Director), 3 (Lead/Manager), 4 (Specialist)
    """
    t = (role_title or "").lower().strip()
    e = (email or "").lower().strip()

    # Founder / CEO detection
    is_founder = False
    if any(k in t for k in ["founder", "co-founder", "cofounder", "ceo", "chief executive", "owner", "president", "managing director"]):
        is_founder = True
        return "executive", 1, is_founder

    if e.startswith("founder@") or e.startswith("ceo@"):
        is_founder = True
        return "executive", 1, is_founder

    # Growth / Marketing leadership (CMO, Head of Growth, Paid Ads Director)
    if any(k in t for k in ["cmo", "chief marketing", "cro", "chief revenue"]):
        return "growth", 1, False

    if any(k in t for k in ["cto", "chief technology"]):
        return "technical", 1, False

    if any(k in t for k in ["coo", "chief operating", "cfo"]):
        return "operations", 1, False

    # Rank 2: VP / Head / Director
    if any(k in t for k in ["vp", "vice president", "head of", "director"]):
        if any(k in t for k in ["growth", "sales", "marketing", "paid", "creative", "media", "acquisition", "ads", "performance"]):
            return "growth", 2, False
        elif any(k in t for k in ["tech", "eng", "product", "software", "data"]):
            return "technical", 2, False
        elif any(k in t for k in ["ops", "operations", "finance"]):
            return "operations", 2, False
        return "executive", 2, False

    # Rank 3: Lead / Manager / Producer
    if any(k in t for k in ["lead", "manager", "strategist", "producer", "coordinator"]):
        if any(k in t for k in ["growth", "marketing", "creative", "media", "ads", "paid"]):
            return "growth", 3, False
        elif any(k in t for k in ["tech", "eng", "product", "software"]):
            return "technical", 3, False
        return "general", 3, False

    # Default fallback
    if any(k in t for k in ["marketing", "growth", "creative", "ads"]):
        return "growth", 3, False

    return "general", 3, False


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
    """Ensure contacts at the same company are staggered by stagger_hours."""
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
        return latest_slot + timedelta(hours=stagger_hours)
    
    return base_scheduled_at
