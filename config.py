"""Central configuration for Outreach ENGINE.

Handles deliverability rules, anti-spam throttling, AI providers,
and company clustering parameters.
"""

from __future__ import annotations

import os
from pathlib import Path
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Outreach ENGINE"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = True
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    BASE_URL: str = "http://localhost:8000"

    # Database
    DATABASE_URL: str = f"sqlite+aiosqlite:///{DATA_DIR / 'outreach_engine.db'}"

    # Deliverability & Anti-Spam (Calculated for Personal Gmails)
    # Personal Gmails have strict spam filters. 500 emails/day requires pooling ~13-15 inboxes.
    DEFAULT_DAILY_LIMIT_PER_INBOX: int = 35    # Safe conservative cap (max safe 50)
    DEFAULT_HOURLY_LIMIT_PER_INBOX: int = 5    # Max 5-6 per hour per inbox
    DEFAULT_MIN_JITTER_SECONDS: int = 90      # Minimum gap between consecutive sends
    DEFAULT_MAX_JITTER_SECONDS: int = 240     # Maximum gap between consecutive sends
    SENDING_HOURS_START: str = "09:00"        # Business hours start
    SENDING_HOURS_END: str = "18:00"          # Business hours end
    SENDING_TIMEZONE: str = "America/New_York"
    WEEKENDS_ENABLED: bool = False            # Don't send on weekends to protect sender reputation
    COMPANY_STAGGER_HOURS: int = 24           # Stagger outreach to colleagues at same company by 24h

    # Warmup curve for new inboxes
    WARMUP_START_DAILY: int = 8
    WARMUP_STEP_DAILY: int = 3
    WARMUP_TARGET_DAILY: int = 35

    # AI & Research API Keys (optional; engine includes fallback heuristic copy generator)
    GEMINI_API_KEY: str | None = os.getenv("GEMINI_API_KEY")
    GROQ_API_KEY: str | None = os.getenv("GROQ_API_KEY")
    ANTHROPIC_API_KEY: str | None = os.getenv("ANTHROPIC_API_KEY")
    OPENAI_API_KEY: str | None = os.getenv("OPENAI_API_KEY")

    # Anti-Slop negative constraints
    BANNED_PHRASES: list[str] = [
        "I hope this email finds you well",
        "I hope you're having a great week",
        "I hope this message finds you",
        "I came across your profile",
        "I noticed your company",
        "Allow me to introduce myself",
        "game changer",
        "revolutionary",
        "innovative solution",
        "take your business to the next level",
        "transform your business",
        "dive deeper",
        "circle back",
        "synergistic",
        "seamlessly integrate",
        "cutting edge",
        "unlock your potential",
        "reach out to you today",
    ]

    class Config:
        env_file = BASE_DIR / ".env"
        extra = "allow"


settings = Settings()
