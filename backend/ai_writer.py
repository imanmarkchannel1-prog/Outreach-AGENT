"""AI Cold Outreach Copywriter for DTC Ads Agency.

Specialized in End-to-End DTC Performance Ads, Meta & TikTok video creatives,
AI product video showcases, creative hook testing, and ROAS scaling.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, Optional, Tuple
import httpx

from config import settings
from backend.models import Campaign, Company, Lead

logger = logging.getLogger("outreach_engine.ai_writer")

DEFAULT_SHOWCASE_URL = "https://dtc-creatives.agency/showcase"


class AIWriter:
    def __init__(self):
        self.banned_phrases = settings.BANNED_PHRASES

    def _build_system_prompt(self, custom_instructions: Optional[str] = None) -> str:
        prompt = (
            "You are an elite DTC Paid Ads Creative Director and cold outreach strategist.\n"
            "We are a specialized DTC Ads Agency that handles END-TO-END DTC Ads for high-growth brands.\n"
            "Our focus is strictly on the PAID ADS DEPARTMENT (Meta & TikTok direct response), NOT generic organic social media posting.\n\n"
            "WHAT WE DELIVER FOR DTC BRANDS:\n"
            "1. End-to-End Ad Creative Production: High-converting 9:16 vertical UGC hooks, 1:1 feed ads, dynamic product showcases, and AI-rendered video ads.\n"
            "2. Creative Hook Testing Framework: Rapid iteration (3–5 new hook angles/week) to eliminate ad creative fatigue and unlock 2x–4x ROAS scale on Meta and TikTok.\n"
            "3. Super High-Quality Deliverables: Scripting, creator sourcing, 3D motion, visual hook testing, and post-production tailored for direct customer acquisition.\n"
            "4. Creative Showcase / Portfolio: We share a custom portfolio link (https://dtc-creatives.agency/showcase) with pre-rendered AI video ads and winning DTC case studies.\n\n"
            "STRICT COPYWRITING RULES (Violating any will fail quality check):\n"
            "1. ZERO SLOP: NEVER say 'I hope this email finds you well', 'I came across', 'I noticed', 'dive into', 'synergy', 'game changer'.\n"
            "2. CONCISE: Under 100 words across 4 short, readable paragraphs.\n"
            "3. SUBJECT: 2 to 4 natural, friendly lowercase words (e.g. 'quick thought: ridge ads', 'ad creative test for feastables').\n"
            "4. P1 HOOK: Congratulate the founder or marketing lead on a recent milestone (<30 days) like a product drop, retail launch, or viral momentum.\n"
            "5. P2 CONTEXT: Reference ad creative fatigue on Meta/TikTok or audience creative saturation.\n"
            "6. P3 OFFER: Highlight our end-to-end DTC ad production (vertical UGC + AI product videos + rapid hook testing) to scale paid ROAS.\n"
            "7. P4 CTA: Soft, low-pressure question offering a 2-minute video teardown + showcase link (e.g. 'Mind if I share the 3 AI ad concepts we modeled for your brand?').\n"
        )
        if custom_instructions:
            prompt += f"\nADDITIONAL CAMPAIGN INSTRUCTIONS:\n{custom_instructions}\n"
        return prompt

    def _build_user_prompt(
        self,
        lead: Lead,
        company: Company,
        campaign: Campaign,
        dossier: Dict[str, Any],
    ) -> str:
        first_name = lead.first_name or (lead.full_name.split()[0] if lead.full_name else "there")
        recent_achievement = dossier.get("recent_achievement", {})
        reddit_intel = dossier.get("reddit_insights", {})
        role_perspective = dossier.get("role_perspective", {})

        return f"""PROSPECT PROFILE:
- Name: {lead.full_name or first_name} ({lead.role_title} at {company.name})
- Decision-Maker Tier: {lead.role_category} (Rank {lead.seniority_rank})
- Focus: {role_perspective.get('strategic_focus', 'DTC Growth & Customer Acquisition')}

BRAND INTEL:
- DTC Brand: {company.name} ({company.domain})
- Recent Milestone (<30 days): {recent_achievement.get('summary', 'Recent catalog expansion and customer growth')}
- Congratulation Angle: {recent_achievement.get('congrats_hook', '')}
- Customer / Reddit Observation: {reddit_intel.get('discussion_thread', '')} | Pain: {reddit_intel.get('pain_point', 'ad creative fatigue on Meta')}

DTC AGENCY VALUE PROP:
- Offer: End-to-end DTC video ads (9:16 vertical UGC + AI product showcases + rapid hook testing to scale Meta/TikTok ROAS).
- Portfolio Showcase: {DEFAULT_SHOWCASE_URL}

INSTRUCTIONS:
Generate a tailored, friendly cold email under 100 words in this JSON format:
{{
  "subject": "2-4 lowercase friendly words",
  "p1_hook": "1 sentence congratulating on recent milestone or brand momentum",
  "p2_context": "1-2 sentences on paid ad creative fatigue or hook saturation",
  "p3_offer": "1-2 sentences on our end-to-end DTC ad creative engine and multi-format testing",
  "p4_cta": "1 friendly, low-friction question offering to send the 3 AI ad concepts"
}}"""

    async def generate_draft(
        self,
        lead: Lead,
        company: Company,
        campaign: Campaign,
        dossier: Dict[str, Any],
        custom_instructions: Optional[str] = None,
    ) -> Tuple[str, str, Dict[str, Any]]:
        """Generate subject and email body using configured LLM or intelligent DTC heuristic fallback."""
        system_prompt = self._build_system_prompt(
            custom_instructions or campaign.custom_instructions
        )
        user_prompt = self._build_user_prompt(lead, company, campaign, dossier)

        # 1. Try Gemini if API key present
        if settings.GEMINI_API_KEY:
            try:
                result = await self._call_gemini(system_prompt, user_prompt)
                if result:
                    subject, body = self._format_email(lead, result)
                    return subject, body, result
            except Exception as e:
                logger.warning(f"Gemini API call failed, falling back: {e}")

        # 2. Try Groq if API key present
        if settings.GROQ_API_KEY:
            try:
                result = await self._call_groq(system_prompt, user_prompt)
                if result:
                    subject, body = self._format_email(lead, result)
                    return subject, body, result
            except Exception as e:
                logger.warning(f"Groq API call failed, falling back: {e}")

        # 3. Try OpenAI if API key present
        if settings.OPENAI_API_KEY:
            try:
                result = await self._call_openai(system_prompt, user_prompt)
                if result:
                    subject, body = self._format_email(lead, result)
                    return subject, body, result
            except Exception as e:
                logger.warning(f"OpenAI API call failed, falling back: {e}")

        # 4. Contextual DTC Heuristic (100% reliable)
        result = self._generate_contextual_heuristic(lead, company, campaign, dossier)
        subject, body = self._format_email(lead, result)
        return subject, body, result

    async def _call_gemini(self, system_prompt: str, user_prompt: str) -> Optional[Dict[str, Any]]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={settings.GEMINI_API_KEY}"
        payload = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"parts": [{"text": user_prompt}]}],
            "generationConfig": {"response_mime_type": "application/json"},
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                return json.loads(text)
        return None

    async def _call_groq(self, system_prompt: str, user_prompt: str) -> Optional[Dict[str, Any]]:
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {"Authorization": f"Bearer {settings.GROQ_API_KEY}"}
        payload = {
            "model": "llama-3.3-70b-versatile",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
        }
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                return json.loads(content)
        return None

    async def _call_openai(self, system_prompt: str, user_prompt: str) -> Optional[Dict[str, Any]]:
        url = "https://api.openai.com/v1/chat/completions"
        headers = {"Authorization": f"Bearer {settings.OPENAI_API_KEY}"}
        payload = {
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
        }
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                return json.loads(content)
        return None

    def _generate_contextual_heuristic(
        self,
        lead: Lead,
        company: Company,
        campaign: Campaign,
        dossier: Dict[str, Any],
    ) -> Dict[str, Any]:
        """High-converting DTC ad creative pitch tailored by role."""
        company_name = company.name or "the brand"
        recent = dossier.get("recent_achievement", {})
        reddit = dossier.get("reddit_insights", {})
        role_cat = lead.role_category

        # P1: Congratulation on recent milestone or brand drop
        if recent.get("has_milestone") and recent.get("congrats_hook"):
            p1 = recent["congrats_hook"]
        else:
            p1 = f"Loved seeing {company_name}'s recent momentum and customer reception lately."

        # Role-tailored DTC Ad Offer
        if role_cat == "executive":
            # Founder / CEO angle: Scaling acquisition profitably, avoiding creative bottlenecks
            subject = f"ad creative for {company_name.lower()}"
            p2 = f"As {company_name} scales on Meta and TikTok, creative fatigue is usually the biggest bottleneck holding back ROAS."
            p3 = f"We run end-to-end DTC ad production — delivering 3–5 net-new vertical UGC hooks and AI product video ads every week so your acquisition never hits a wall."
            p4 = f"We modeled 3 AI video ad concepts for {company_name}. Mind if I send the showcase link over?"
        elif role_cat == "growth":
            # CMO / Head of Growth angle: Testing velocity, multiple formats, lowering blended CAC
            subject = f"new ad hooks for {company_name.lower()}"
            p2 = f"Saw your recent Meta campaigns and wanted to share a few fresh hook angles to test against audience creative fatigue."
            p3 = f"We produce end-to-end performance ads for DTC brands (9:16 vertical video, AI product showcases, and rapid hook testing) built directly to unlock lower CAC."
            p4 = f"Put together a quick 2-minute creative breakdown and 3 video concepts for your team. Open to taking a look?"
        else:
            # Creative / General angle
            subject = f"quick idea for {company_name.lower()} ads"
            p2 = f"Noticed how fast {company_name}'s catalog is growing and had an idea for refreshing your top-of-funnel video creatives."
            p3 = f"We handle end-to-end DTC ad creation and multi-format testing across Meta and TikTok, delivering high-impact video ads ready for Ads Manager."
            p4 = f"Open to checking out a quick preview of 3 video hooks we modeled for your brand?"

        return {
            "subject": subject,
            "p1_hook": p1,
            "p2_context": p2,
            "p3_offer": p3,
            "p4_cta": p4,
        }

    def _format_email(self, lead: Lead, data: Dict[str, Any]) -> Tuple[str, str]:
        first_name = lead.first_name or (lead.full_name.split()[0] if lead.full_name else "there")
        subject = data.get("subject", "quick thought on ads").strip().strip('"')
        subject = re.sub(r'^(subject:\s*)+', '', subject, flags=re.IGNORECASE).strip()

        p1 = data.get("p1_hook", "").strip()
        p2 = data.get("p2_context", "").strip()
        p3 = data.get("p3_offer", "").strip()
        p4 = data.get("p4_cta", "").strip()

        body = (
            f"Hey {first_name},\n\n"
            f"{p1}\n\n"
            f"{p2}\n\n"
            f"{p3}\n\n"
            f"{p4}\n\n"
            f"Best,\n"
            f"Alex\n"
            f"DTC Creative Lab &middot; {DEFAULT_SHOWCASE_URL}"
        )
        return subject, body

    def generate_follow_up(
        self,
        lead: Lead,
        company: Company,
        campaign: Campaign,
        step: int = 1,
    ) -> Dict[str, Any]:
        """Generate high-converting, friendly DTC follow-up bumps (<45 words)."""
        first_name = lead.first_name or (lead.full_name.split()[0] if lead.full_name else "there")
        brand = company.name or "the brand"

        if step == 1:
            subject = f"Re: ad creative for {brand.lower()}"
            body = (
                f"Hey {first_name},\n\n"
                f"Quick bump on this in case it got buried under {brand}'s sprint priorities.\n\n"
                f"Uploaded the 3 AI video ad concepts to our showcase link ({DEFAULT_SHOWCASE_URL}). Mind if I send the 60-second preview?\n\n"
                f"Best,\nAlex"
            )
        else:
            subject = f"Re: {brand.lower()} ad hooks"
            body = (
                f"Hey {first_name},\n\n"
                f"Guessing your creative pipeline is running full steam right now.\n\n"
                f"If you ever hit ad fatigue on Meta or want a fresh round of UGC/AI hook tests to scale ROAS for {brand}, our door's open at {DEFAULT_SHOWCASE_URL}.\n\n"
                f"Wishing you continued scale!\nAlex"
            )

        return {"step": step, "subject": subject, "body": body}

    def generate_reply_back(
        self,
        lead: Lead,
        company: Company,
        campaign: Campaign,
        incoming_message: str,
        instruction: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Draft tailored response to warm prospect inquiring about DTC ads."""
        first_name = lead.first_name or (lead.full_name.split()[0] if lead.full_name else "there")
        brand = company.name or "your brand"

        subject = f"Re: {brand} ad creative"
        body = (
            f"Hey {first_name},\n\n"
            f"Thanks for getting back to me! Glad this caught your eye.\n\n"
            f"For {brand}, we typically begin by analyzing your current top 3 Meta/TikTok ad hooks and building out 3 net-new creative angles (including AI-rendered product showcases and vertical UGC).\n\n"
            f"You can explore some of our recent DTC video campaigns here: {DEFAULT_SHOWCASE_URL}\n\n"
            f"Are you open to a quick 15-minute sync next Tuesday or Wednesday to review the concepts we prepared for {brand}?\n\n"
            f"Best,\nAlex Rivera"
        )
        return {"subject": subject, "body": body}


ai_writer = AIWriter()
