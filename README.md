# 🚀 Outreach ENGINE — Autonomous Cold Outreach Platform

> **Engineered for High-Converting, Zero-Slop Cold Outreach with Multi-Inbox Personal Gmail Protection**  
> Direct integration with **Antigravity AI Agent** via Model Context Protocol (MCP) · Live Web & Reddit Context Enrichment · Multi-Lead Company Clustering & Staggering · Anti-Spam Deliverability Governor

---

## 🏗️ System Architecture

```
                    ┌──────────────────────────────┐
                    │      ANTIGRAVITY AGENT       │
                    │  AI Brain · Prompt Controls  │
                    └──────────────┬───────────────┘
                                   │  Model Context Protocol (MCP)
                                   ▼
                    ┌──────────────────────────────┐
                    │   OUTREACH ENGINE MCP SERVER │
                    │     HTTP Endpoint: /api/mcp   │
                    └──────────────┬───────────────┘
                                   │  Internal Async Bus
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       OUTREACH ENGINE PLATFORM                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ 📥 CSV Ingestion & Flexible Field Mapper                                     │
│ 🏢 Company Clustering & Multi-Contact Staggering (24h separation)           │
│ 🌐 Live Research Engine (Recent News & Milestones <30d + Reddit Sentiment)  │
│ ✍️ AI Personalization Engine (Anti-Slop 4-paragraph framework)              │
│ 🛡️ Deliverability Governor (35 sends/day · 5 sends/hr · 90-240s jitter)     │
│ 🕒 Business Hours Scheduler (09:00 - 18:00 · Weekday enforcement)           │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │  Smart Round-Robin Rotation
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
┌───────────────┐              ┌───────────────┐              ┌───────────────┐
│    Gmail 1    │              │    Gmail 2    │              │   Gmail 3..N  │
│ 35 sends/day  │              │ 35 sends/day  │              │ 35 sends/day  │
│  5 sends/hr   │              │  5 sends/hr   │              │  5 sends/hr   │
└───────────────┘              └───────────────┘              └───────────────┘
```

---

## 🎯 How to Send 500 Cold Emails/Day Responsibly (The Math)

Google's spam filters continuously analyze sending velocity, domain reputation, and burst patterns on personal `@gmail.com` accounts:

* **The Danger of Single-Inbox Sending:** Sending 500 emails in a day from a single personal Gmail will result in immediate account suspension, CAPTCHA blocks, or 100% spam folder placement.
* **The Safe Deliverability Standard:**
  * **Daily Cap per Inbox:** **35 emails/day** (hard maximum: 50).
  * **Hourly Cap per Inbox:** **5 emails/hour** (spaced throughout business hours).
  * **Randomized Jitter:** **90 to 240 seconds** (1.5 to 4 minutes) between consecutive sends on the same account.
  * **Sending Window:** **09:00 to 18:00** (business hours; weekends paused).
* **The 500-Email Fleet Solution:**
  $$\text{Required Inboxes} = \lceil \frac{500 \text{ emails/day}}{35 \text{ emails/inbox/day}} \rceil = \mathbf{15 \text{ connected Gmail accounts}}$$
  * The engine pools your connected Gmail accounts into a unified sender fleet.
  * If you have 3 accounts connected, safe capacity is **105 emails/day**.
  * If your list has 500 prospects, the engine automatically distributes them safely over the required number of days or scales across your connected accounts without any risk of hitting spam filters.

---

## 🏢 Company Clustering & Multi-Prospect Staggering

When a CSV contains multiple contacts from the same company (e.g. CEO, CTO, and VP Marketing at Stripe):

1. **Automatic Clustering:** Leads are normalized and grouped by company domain.
2. **Seniority Hierarchy:** The system ranks contacts by seniority (Rank 1: C-Suite/Founders, Rank 2: VPs/Directors, Rank 3: Leads/Managers).
3. **24-Hour Stagger Rule:** The engine ensures that **no two employees at the same company receive an outreach email on the same day**. Primary decision-makers are scheduled first, with colleagues spaced by 24 to 48 hours to prevent "Did you get spammed too?" backlash.
4. **Role-Tailored Framing:** The AI automatically shifts the message angle based on their post:
   * **Executive / Founder:** Strategic ARR growth, competitive moats, and executive leverage.
   * **Technical / CTO:** System reliability, tech debt reduction, developer velocity.
   * **Growth / Sales:** Pipeline velocity, conversion rates, and reducing CAC.

---

## 🌐 Deep Context: News (<30 Days) & Reddit Insights

For every company and prospect:
1. **Recent News & Milestones:** Searches for press releases, product launches, acquisitions, and funding within the last **30 days**. If found, the engine crafts an authentic, non-sycophantic congratulatory opening hook.
2. **Reddit Community Sentiment:** Queries Reddit discussions (`site:reddit.com "[Company Name]"`) for authentic community pain points, bug complaints, or tech stack discussions.
3. **Anti-Slop Copywriting:** Enforces strict anti-slop rules:
   * **Forbidden:** *"I hope this email finds you well"*, *"I came across your profile"*, *"game changer"*, *"revolutionary"*, *"take your business to the next level"*, *"dive deeper"*.
   * **Structure:** Under 110 words across 4 punchy paragraphs:
     * **P1 (Hook):** Recent achievement (<30d) or razor-sharp company observation.
     * **P2 (Context):** Real-world Reddit pain point or operational bottleneck.
     * **P3 (Value Prop):** Exactly what your offer does to eliminate that friction.
     * **P4 (Soft CTA):** Zero-friction low-commitment question (*"Open to checking out a 2-minute walkthrough?"*).

---

## ⚡ Quick Start

### 1. Launch the Engine
Open your terminal and run:

```bash
cd "/Users/krishna/Documents/Outreach ENGINE"
./start.sh
```

Open your browser to: **`http://localhost:8000`**

### 2. Connect Your Personal Gmail Inboxes
1. In the Web UI, go to **Inboxes** &rarr; **Add Sender Gmail**.
2. Enter your Gmail address, display name, and a 16-character **Google App Password**.
   * *(Generate one at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) with 2-Step Verification enabled).*
3. Add as many accounts as you have (each adds 35 safe sends/day to your fleet capacity).

### 3. Import CSV & Launch
* In the Web UI, go to **CSV & Campaign**, upload your CSV (or click **Load Sample CSV**).
* Enter your campaign pitch and any custom instructions.
* Click **Run Autonomous Pipeline** — the engine will research the leads, extract Reddit & news context, draft tailored emails, and schedule them across your inboxes!

---

## 🤖 Connecting Antigravity AI Agent via MCP

Outreach ENGINE exposes a native FastMCP Streamable HTTP server at **`http://localhost:8000/api/mcp`**.

### Available MCP Tools for Antigravity:
* `list_leads(q, status, campaign_id, limit)`: Query leads by status or keyword.
* `get_lead_details(lead_id)`: Inspect full lead dossier, Reddit intel, and draft.
* `research_prospect(lead_id)`: Trigger live web and Reddit research.
* `generate_email_draft(lead_id, custom_instructions)`: Draft anti-slop copy.
* `approve_email_draft(lead_id, custom_subject, custom_body)`: Approve draft for queueing.
* `get_deliverability_metrics()`: Inspect active fleet capacity and hourly pacing.
* `run_autonomous_pipeline(campaign_id, csv_content, custom_instructions, auto_approve)`: Trigger end-to-end execution directly from chat!

---

## 📁 Project Structure

```
Outreach ENGINE/
├── README.md                      # Complete manual & deliverability documentation
├── config.py                      # Global parameters, deliverability caps, anti-slop rules
├── requirements.txt               # Python dependencies
├── start.sh                       # One-click launcher script
├── .env.example                   # Environment variable template
├── backend/
│   ├── main.py                    # FastAPI server + MCP endpoint mount (/api/mcp)
│   ├── database.py                # Async SQLite engine & session factory
│   ├── models.py                  # SQLAlchemy models (Campaign, Company, Lead, Draft, Inbox, QueueSlot)
│   ├── schemas.py                 # Pydantic schemas for REST & serialization
│   ├── company_clustering.py      # Company domain grouping & 24h stagger calculation
│   ├── research_engine.py         # Autonomous Web & Reddit searcher (<30d milestones)
│   ├── ai_writer.py               # Anti-slop copywriting engine with multi-provider LLMs
│   ├── deliverability.py          # Anti-spam pacing, jitter, and business-hours governor
│   ├── email_dispatcher.py        # Multi-inbox sender with auto-quarantine protection
│   ├── mcp_server.py              # Model Context Protocol server for Antigravity
│   └── pipeline.py                # End-to-end autonomous pipeline coordinator
├── frontend/
│   ├── index.html                 # Modern dark-mode dashboard
│   ├── app.js                     # Interactive application logic
│   └── styles.css                 # Styling & animations
├── examples/
│   └── sample_prospects.csv       # Multi-contact company test dataset
└── data/
    └── outreach_engine.db         # Persistent SQLite database
```

---

## 🔒 Deliverability & Security Best Practices
* **Never blast >5 emails/hour per inbox:** Sending in bursts triggers spam heuristic flags.
* **Warm up new accounts:** The engine automatically applies a gradual warmup curve (+3 emails/day).
* **Respect 24-hour company staggering:** Never email multiple people at the same company simultaneously.
* **Keep emails under 110 words:** Long sales letters trigger spam filters and lower reply rates.
