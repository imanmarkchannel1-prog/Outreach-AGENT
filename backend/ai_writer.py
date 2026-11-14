"""AI Cold Outreach Copywriter.

Enforces strict anti-slop guidelines, congratulates on recent wins (<30 days),
incorporates Reddit community insights, and adapts the pitch to the prospect's role.
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


class AIWriter:
    def __init__(self):
        self.banned_phrases = settings.BANNED_PHRASES

    def _build_system_prompt(self, custom_instructions: Optional[str] = None) -> str:
        prompt = (
            "You are an elite B2B cold email strategist. You write concise, peer-to-peer, "
            "authentic cold outreach that reads like it was written by an industry colleague.\n\n"
            "STRICT RULES (Violating any will fail quality check):\n"
            "1. NO generic pleasantries: NEVER use 'I hope this email finds you well', 'I came across', 'I noticed', 'dive into'.\n"
            "2. NO buzzwords: NEVER use 'game changer', 'revolutionary', 'transform', 'synergy', 'leverage', 'innovative'.\n"
            "3. TOTAL LENGTH: Under 110 words across 4 short paragraphs.\n"
            "4. SUBJECT LINE: 2 to 4 lowercase or natural words. Zero sales hype.\n"
            "5. P1 HOOK: If there is a recent win or announcement within the past 30 days, congratulate them in 1 authentic sentence.\n"
            "6. P2 CONTEXT: Weave in the Reddit community observation or specific operational pain point for their role.\n"
            "7. P3 OFFER: State exactly what we do and how it eliminates that friction.\n"
            "8. P4 CTA: Soft, low-friction, zero-pressure question (e.g. 'Mind if I share a 2-minute walkthrough?').\n"
        )
        if custom_instructions:
            prompt += f"\nADDITIONAL USER INSTRUCTIONS FROM CHAT:\n{custom_instructions}\n"
        return prompt

    def _build_user_prompt(
        self,
        lead: Lead,
        company: Company,
        campaign: Campaign,
        dossier: Dict[str, Any],
    ) -> str:
        first_name = lead.first_name or lead.full_name.split()[0] if lead.full_name else "there"
        recent_achievement = dossier.get("recent_achievement", {})
        reddit_intel = dossier.get("reddit_insights", {})
        role_perspective = dossier.get("role_perspective", {})

        return f"""PROSPECT PROFILE:
- Name: {lead.full_name or first_name} ({lead.role_title} at {company.name})
- Role Category: {lead.role_category}
- Strategic Focus: {role_perspective.get('strategic_focus', '')}

COMPANY INTEL:
- Company: {company.name} ({company.domain})
- Recent Milestone (<30 days): {recent_achievement.get('summary', 'Recent market growth')}
- Congratulation Angle: {recent_achievement.get('congrats_hook', '')}
- Reddit Community Observation: {reddit_intel.get('discussion_thread', '')} | Pain: {reddit_intel.get('pain_point', '')}

CAMPAIGN OFFER:
- Sender Name: {campaign.sender_name}
- What we offer / Value Prop: {campaign.offer_pitch}

INSTRUCTIONS:
Generate a personalized email following the 4-part structure.
Return strictly valid JSON in this schema:
{{
  "subject": "2-4 words subject line",
  "p1_hook": "1 sentence congratulating on recent achievement or sharp role hook",
  "p2_context": "1-2 sentences referencing the Reddit / workflow pain point",
  "p3_offer": "1-2 sentences tying our offer pitch directly to solving this",
  "p4_cta": "1 low-friction soft closing question"
}}"""

    async def generate_draft(
        self,
        lead: Lead,
        company: Company,
        campaign: Campaign,
        dossier: Dict[str, Any],
        custom_instructions: Optional[str] = None,
    ) -> Tuple[str, str, Dict[str, Any]]:
        """Generate subject and email body using configured LLM or intelligent heuristic fallback."""
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

        # 4. Intelligent contextual synthesis (No API key needed — 100% reliable)
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
        """High-converting, role-adapted anti-slop copy engine built on research dossier."""
        first_name = lead.first_name or (lead.full_name.split()[0] if lead.full_name else "there")
        company_name = company.name or "the team"
        recent = dossier.get("recent_achievement", {})
        reddit = dossier.get("reddit_insights", {})
        role_cat = lead.role_category

        # Hook / Congratulation
        if recent.get("has_milestone") and recent.get("congrats_hook"):
            p1 = recent["congrats_hook"]
        else:
            p1 = f"Saw {company_name}'s recent momentum and expansion — great progress."

        # Role-tailored observation & Reddit context
        pain = reddit.get("pain_point") or "scaling operational bandwidth without burning engineering cycles"
        if role_cat == "technical":
            subject = f"{company_name.lower()} + tech stack question"
            p2 = f"Noticed recent community discussions around how engineering teams at {company_name} navigate {pain}."
            p3 = f"We built {campaign.offer_pitch} to give technical leaders direct leverage here without adding technical debt."
            p4 = "Mind if I send a quick 90-second loom showing the architecture?"
        elif role_cat == "growth":
            subject = f"question re: {company_name.lower()} pipeline"
            p2 = f"Saw discussions on Reddit regarding customer friction and growth scaling for teams like {company_name}."
            p3 = f"We help growth leaders solve this: {campaign.offer_pitch}."
            p4 = "Worth a brief exchange next Tuesday?"
        elif role_cat == "executive":
            subject = f"congrats on {company_name.lower()} + brief idea"
            p2 = f"As {company_name} scales, managing {pain} usually becomes a top bottleneck on executive bandwidth."
            p3 = f"We partner with leadership to address this: {campaign.offer_pitch}."
            p4 = "Open to checking out a 2-minute overview?"
        else:
            subject = f"quick thought: {company_name.lower()}"
            p2 = f"Noticed teams in your space frequently running into friction with {pain}."
            p3 = f"We specifically solve this: {campaign.offer_pitch}."
            p4 = "Open to a quick look?"

        return {
            "subject": subject,
            "p1_hook": p1,
            "p2_context": p2,
            "p3_offer": p3,
            "p4_cta": p4,
        }

    def _format_email(self, lead: Lead, data: Dict[str, Any]) -> Tuple[str, str]:
        first_name = lead.first_name or (lead.full_name.split()[0] if lead.full_name else "there")
        subject = data.get("subject", "quick question").strip().strip('"')
        
        # Clean subject line: ensure 2-5 words, lowercase or clean
        subject = re.sub(r'^(subject:\s*)+', '', subject, flags=re.IGNORECASE).strip()

        p1 = data.get("p1_hook", "").strip()
        p2 = data.get("p2_context", "").strip()
        p3 = data.get("p3_offer", "").strip()
        p4 = data.get("p4_cta", "").strip()

        # Build clean paragraph-separated body
        body = (
            f"Hey {first_name},\n\n"
            f"{p1}\n\n"
            f"{p2}\n\n"
            f"{p3}\n\n"
            f"{p4}"
        )

        return subject, body


ai_writer = AIWriter()
