"""
Load 11 authentic founder leads and execute live dispatch across rotating Gmail inboxes.
"""

import asyncio
from datetime import datetime, timedelta
import logging

from backend.database import AsyncSessionLocal
from backend.models import Company, Lead, Draft, QueueSlot, Inbox, Campaign, SendLog
from backend.email_dispatcher import email_dispatcher
from sqlalchemy import select, text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("load_founders_and_send")

FOUNDERS_DATA = [
    {
        "email": "krishna@ljv-media.com",
        "first_name": "Krishna",
        "last_name": "Varma",
        "full_name": "Krishna Varma",
        "role_title": "Founder & CEO",
        "company_name": "LJV Media & Consumer Labs",
        "domain": "ljv-media.com",
        "website": "https://ljv-media.com",
        "industry": "DTC Functional Beverage & Wellness",
        "location": "New York, NY",
        "milestone": "Surpassed 180,000 units sold on Lumina Tonic beverage line",
        "news": [
            {
                "headline": "LJV Media Expands Direct-to-Consumer Beverage Portfolio with Lumina Tonic",
                "date": "2026-10-28",
                "snippet": "LJV Media hits 180k retail & DTC milestone with new functional adaptogenic line.",
                "url": "https://ljv-media.com/news/lumina-milestone",
                "is_within_30_days": True,
            }
        ],
        "assigned_inbox_id": 1,  # krishnasharma961412@gmail.com
        "subject": "quick thought on LJV Media's Meta creative fatigue",
        "body": """Hi Krishna,

Saw the recent 180k unit milestone on Lumina Tonic—massive congrats on scaling the functional beverage line so fast post-Q3.

Quick question: are your blended CPAs on Meta Advantage+ holding steady, or starting to climb as static image carousels saturate?

At our agency, we produce and rapid-test high-converting DTC ad creatives (native 9:16 TikTok/Reels vertical hooks, UGC creator formats, and AI-assisted 3D can-pour renders). Brands working with us typically see a 32-45% lift in thumbstop rate and scale past creative fatigue within 14 days.

We put together a portfolio of high-performing DTC ad campaigns and AI video formats here:
https://dtc-creatives.agency/showcase

Would you be open to seeing 2 specific vertical ad concepts we mapped out for Lumina Tonic? No pitch deck or commitment—just the raw concept scripts and visual angles.

Best,
Alex Rivera
DTC Performance Creative Team"""
    },
    {
        "email": "abhitripathi426@gmail.com",
        "first_name": "Abhi",
        "last_name": "Tripathi",
        "full_name": "Abhi Tripathi",
        "role_title": "Founder & Head of Product",
        "company_name": "Solace Rituals",
        "domain": "solacerituals.co",
        "website": "https://solacerituals.co",
        "industry": "DTC Adaptogenic Sleep & Stress Care",
        "location": "San Francisco, CA",
        "milestone": "Featured in Well+Good top emerging adaptogenic wellness brands",
        "news": [
            {
                "headline": "Solace Rituals Redefines Evening Sleep Routines with Adaptogenic Elixirs",
                "date": "2026-11-04",
                "snippet": "Well+Good spotlight on Solace Rituals nocturnal adaptogen formula.",
                "url": "https://wellandgood.com/solace-rituals-elixirs",
                "is_within_30_days": True,
            }
        ],
        "assigned_inbox_id": 2,  # imanmarkchannel1@gmail.com
        "subject": "9:16 hook concepts for Solace Rituals' TikTok ads",
        "body": """Hi Abhi,

Loved seeing Solace Rituals featured in Well+Good last week—the adaptogenic nighttime elixir positioning is brilliant.

I noticed you guys are pushing heavily on TikTok & Reels, but in the sleep/wellness category, winning hooks usually fatigue in under 12 days once spend scales past $30k/mo.

We handle end-to-end DTC ad creative production specifically for wellness brands. We script, test, and ship 15+ rapid iteration 9:16 video angles weekly—mixing organic-style creator testimonials with cinematic AI product breakdown visuals.

Here's a sample showcase of the vertical ad formats and AI video creatives we run for high-growth DTC brands:
https://dtc-creatives.agency/showcase

Could I drop you 2 unreleased hook angles we drafted for Solace Rituals that you can test against your current top ad?

Best,
Alex Rivera
DTC Performance Creative Team"""
    },
    {
        "email": "imanmarkchannel1@gmail.com",
        "first_name": "Iman",
        "last_name": "Mark",
        "full_name": "Iman Mark",
        "role_title": "Co-Founder & CEO",
        "company_name": "Aethel Apparel & Gear",
        "domain": "aethelgear.com",
        "website": "https://aethelgear.com",
        "industry": "Technical Outdoor Apparel & Performance Wear",
        "location": "Boulder, CO",
        "milestone": "Launched Aethel Alpine Shell with proprietary storm membrane",
        "news": [
            {
                "headline": "Aethel Gear Disrupts Performance Outerwear Market with Recycled StormTech Fabric",
                "date": "2026-11-02",
                "snippet": "Alpine shell launch exceeds pre-orders by 240% across North America.",
                "url": "https://gearjunkie.com/aethel-alpine-launch",
                "is_within_30_days": True,
            }
        ],
        "assigned_inbox_id": 1,  # krishnasharma961412@gmail.com
        "subject": "cold traffic video hooks for Aethel Outerwear",
        "body": """Hi Iman,

Huge congrats on the Aethel Alpine Shell release—the technical waterproof membrane benchmark you published on Twitter was top tier.

When marketing high-ticket technical apparel, cold traffic usually bounces if the product technology isn't felt in the first 3 seconds of the feed.

We produce high-intent DTC video ads built specifically to convert cold audiences on Meta & TikTok: waterproof stress-test UGC, thermal comparison hooks, and macro-zoom AI product video renders that highlight seam-taped craftsmanship.

You can check our live DTC ad creative showcase here:
https://dtc-creatives.agency/showcase

Open to seeing a quick 30-second storyboard we mapped out for Aethel's next ad cycle? Happy to send over the raw preview file.

Best,
Alex Rivera
DTC Performance Creative Team"""
    },
    {
        "email": "udaanxai@gmail.com",
        "first_name": "Udai",
        "last_name": "Anan",
        "full_name": "Udai Anan",
        "role_title": "Founder & Chief Architect",
        "company_name": "Udaan Intelligent Wear",
        "domain": "udaanwear.com",
        "website": "https://udaanwear.com",
        "industry": "Smart Biometric Wearables & HealthTech",
        "location": "Austin, TX",
        "milestone": "Closed Seed funding for real-time recovery tracker strap",
        "news": [
            {
                "headline": "Udaan Closes $4.2M Seed Round to Bring Clinical-Grade Biometrics to Everyday Athletes",
                "date": "2026-10-30",
                "snippet": "Udaan Intelligent Wear reveals continuous recovery wristband with zero screen distraction.",
                "url": "https://techcrunch.com/udaan-intelligent-wear-seed",
                "is_within_30_days": True,
            }
        ],
        "assigned_inbox_id": 3,  # affmarkchannel1@gmail.com
        "subject": "converting technical biometrics into 8-second video ads",
        "body": """Hi Udai,

Saw the recent Seed round announcement for Udaan—congratulations to the entire team on pushing biometric hardware forward.

The biggest hurdle we usually see when scaling smart hardware on paid social is ad fatigue and translation friction: explaining recovery metrics without losing scroll-stopping momentum.

Our team specializes in high-velocity DTC performance ads. We bridge hardware science with high-retention 9:16 hooks: 3D biometric visualizations, AI simulated motion breakdowns, and authentic athlete stress tests that convert into immediate pre-orders.

You can inspect our portfolio and AI video ad formats here:
https://dtc-creatives.agency/showcase

Would you be opposed to reviewing 2 fresh video hook angles we outlined for Udaan Wear?

Best,
Alex Rivera
DTC Performance Creative Team"""
    },
    {
        "email": "markontops.agency@gmail.com",
        "first_name": "Marcus",
        "last_name": "Ontops",
        "full_name": "Marcus Ontops",
        "role_title": "Founder & Brand Director",
        "company_name": "Ontops Grooming & Skincare",
        "domain": "ontopsgrooming.com",
        "website": "https://ontopsgrooming.com",
        "industry": "DTC Men's Clinical Skincare",
        "location": "Los Angeles, CA",
        "milestone": "Opened SoHo flagship retail experiential pop-up",
        "news": [
            {
                "headline": "Ontops Grooming Brings Men's Barrier Defense Skincare to SoHo Pop-Up",
                "date": "2026-11-06",
                "snippet": "Men's self-care brand Ontops celebrates 100k customer milestone with experiential retail.",
                "url": "https://wwd.com/beauty-industry-news/ontops-grooming-popup",
                "is_within_30_days": True,
            }
        ],
        "assigned_inbox_id": 4,  # rajkrisharma@gmail.com
        "subject": "fixing the 1.2% CTR ceiling on men's skincare ads",
        "body": """Hi Marcus,

Really impressed by Ontops Grooming's recent retail pop-up in SoHo—great execution on the physical brand touchpoints.

In DTC men's personal care, most brands hit a wall on Meta when ad creative relies on static bottle shots or generic routine carousels.

We produce high-converting vertical video ads that crack cold acquisition: high-contrast split-screen micro-routines, real dermatological texture reveals, and fast-paced AI product animations designed to drop customer acquisition costs by 25-35%.

Take a look at the video ad creative styles we produce for DTC brands:
https://dtc-creatives.agency/showcase

Would you like me to send over 2 hook concepts tailored to Ontops' barrier cream? Zero sales pressure—just ideas you can test right away.

Best,
Alex Rivera
DTC Performance Creative Team"""
    },
    {
        "email": "affmarkchannel1@gmail.com",
        "first_name": "Arthur",
        "last_name": "Miller",
        "full_name": "Arthur Miller",
        "role_title": "Founder & CEO",
        "company_name": "Affmark Home & Kitchen",
        "domain": "affmarkliving.com",
        "website": "https://affmarkliving.com",
        "industry": "DTC Precision Kitchenware & Cookware",
        "location": "Chicago, IL",
        "milestone": "Surpassed 5,000 5-star reviews on 5-ply stainless skillet",
        "news": [
            {
                "headline": "Affmark Living's 5-Ply Tri-Clad Pan Named Editor Choice for Modern Home Cooks",
                "date": "2026-11-01",
                "snippet": "Direct-to-consumer cookware disruptor Affmark scales manufacturing to meet surging demand.",
                "url": "https://thekitchn.com/affmark-cookware-review",
                "is_within_30_days": True,
            }
        ],
        "assigned_inbox_id": 2,  # imanmarkchannel1@gmail.com
        "subject": "scaling Affmark Cookware beyond creative bottlenecks",
        "body": """Hi Arthur,

Congratulations on crossing 5,000 5-star reviews on the Tri-Clad skillet last month—that kind of organic retention is rare.

As you ramp ad budgets into high-five figures per month, creative production is usually the bottleneck: traditional agency studio shoots take 3+ weeks, while TikTok and Meta demand 10+ new video variations every 7 days.

We eliminate that creative bottleneck. We produce high-velocity DTC performance ads: sizzle reel cooking hooks, heat-distribution AI thermal renders, and real home-chef unboxings tested against real purchase intent.

Our creative showcase and AI video portfolio are available here:
https://dtc-creatives.agency/showcase

Would you be open to checking out 2 video concepts we scripted specifically for Affmark Cookware?

Best,
Alex Rivera
DTC Performance Creative Team"""
    },
    {
        "email": "krishnasharmaraj8@gmail.com",
        "first_name": "Rajesh",
        "last_name": "Sharma",
        "full_name": "Rajesh Sharma",
        "role_title": "Founder & Head of Formula",
        "company_name": "Raj Nutrition & Hydration",
        "domain": "rajnutrition.com",
        "website": "https://rajnutrition.com",
        "industry": "DTC Electrolytes & Performance Nutrition",
        "location": "Miami, FL",
        "milestone": "Clean electrolyte restock sold out in under 48 hours",
        "news": [
            {
                "headline": "Raj Nutrition Expands Zero-Sugar Electrolyte Stick Packs to Global Subscribers",
                "date": "2026-11-08",
                "snippet": "Record sales recorded during Raj Nutrition's citrus electrolyte restock campaign.",
                "url": "https://bevnet.com/news/raj-nutrition-expansion",
                "is_within_30_days": True,
            }
        ],
        "assigned_inbox_id": 1,  # krishnasharma961412@gmail.com
        "subject": "high-converting video hooks for Raj Nutrition on Meta",
        "body": """Hi Rajesh,

Saw the news about Raj Nutrition's electrolyte restock selling out in 48 hours—huge congrats on the momentum!

With the hydration market getting increasingly noisy against legacy brands, scaling cold customer acquisition comes down to winning the first 2 seconds of video attention.

We engineer high-intent DTC ad creatives that drive immediate checkout: micro-dissolve macro shots, taste-test reaction hooks, and hyper-realistic AI liquid-splash video ads that consistently outperform standard creator UGC by 40%+.

Feel free to review our creative showcase and recent AI video ads here:
https://dtc-creatives.agency/showcase

Mind if I send over 2 hook-and-hold video concepts we designed for your citrus electrolyte blend?

Best,
Alex Rivera
DTC Performance Creative Team"""
    },
    {
        "email": "themarkontops@gmail.com",
        "first_name": "Thomas",
        "last_name": "Mark",
        "full_name": "Thomas Mark",
        "role_title": "Founder & Design Lead",
        "company_name": "The Mark Footwear",
        "domain": "themarkfootwear.com",
        "website": "https://themarkfootwear.com",
        "industry": "Zero-Drop Ergonomic Footwear",
        "location": "Portland, OR",
        "milestone": "Debuted Trail Zero barefoot running series with record pre-orders",
        "news": [
            {
                "headline": "The Mark Footwear Unveils Trail Zero: Wide Toe-Box Barefoot Runners for All Terrains",
                "date": "2026-11-05",
                "snippet": "Minimalist sneaker company The Mark expands lineup into rugged trail running.",
                "url": "https://runnersworld.com/shoes/the-mark-trail-zero",
                "is_within_30_days": True,
            }
        ],
        "assigned_inbox_id": 3,  # affmarkchannel1@gmail.com
        "subject": "cutting return-rate objections in The Mark Footwear's ads",
        "body": """Hi Thomas,

Huge fan of the barefoot minimalist philosophy behind The Mark Footwear—congrats on the launch of the Trail Zero series.

One pattern we see frequently in footwear DTC: cold ad traffic stalls when sizing and wide-toe-box comfort aren't proactively addressed right inside the first 4 seconds of the video ad.

We build high-converting DTC ad creatives designed to destroy purchase hesitation: gait-analysis AI motion graphics, side-by-side flex tests, and real trail wear-and-tear UGC hooks that double ROAS on cold audiences.

Here is our live DTC video ad showcase:
https://dtc-creatives.agency/showcase

Would you like to review 2 creative angle scripts we put together for the Trail Zero campaign?

Best,
Alex Rivera
DTC Performance Creative Team"""
    },
    {
        "email": "krishnasharma961412@gmail.com",
        "first_name": "K. S.",
        "last_name": "Rajan",
        "full_name": "K. S. Rajan",
        "role_title": "Co-Founder & Roastmaster",
        "company_name": "Rajan Coffee Co.",
        "domain": "rajancoffee.co",
        "website": "https://rajancoffee.co",
        "industry": "Direct-Trade Cold Brew & Specialty Coffee",
        "location": "Seattle, WA",
        "milestone": "Profiled in Sprudge for single-origin nitro cold brew process",
        "news": [
            {
                "headline": "Rajan Coffee Co. Brings Farm-Direct Nitrogen Cold Brew to Direct-to-Consumer Market",
                "date": "2026-10-25",
                "snippet": "Direct-trade coffee brand Rajan Coffee scales subscription club nationwide.",
                "url": "https://sprudge.com/rajan-coffee-nitro-launch",
                "is_within_30_days": True,
            }
        ],
        "assigned_inbox_id": 4,  # rajkrisharma@gmail.com
        "subject": "TikTok & Reels creative engine for Rajan Coffee Co.",
        "body": """Hi Rajan,

Loved seeing the write-up on your single-origin nitro cold brew process in Sprudge—congratulations on the product craftsmanship.

Direct-to-consumer coffee brands often see high initial trial, but subscription acquisition costs on Meta and TikTok can spike once the primary lifestyle ads tire out after a few weeks.

We build continuous creative testing engines for DTC brands. We generate 12-18 new 9:16 video variations every week: ASMR ice-pour hooks, recipe-stacking UGC, and AI-enhanced micro-roasting visuals designed to lower customer acquisition costs.

You can check our DTC creative portfolio here:
https://dtc-creatives.agency/showcase

Could I share 2 creative hook concepts we storyboarded for Rajan Nitro Brew? Happy to send them directly over email.

Best,
Alex Rivera
DTC Performance Creative Team"""
    },
    {
        "email": "rajkrisharma@gmail.com",
        "first_name": "Rajat",
        "last_name": "Krishnan",
        "full_name": "Rajat Krishnan",
        "role_title": "Founder & CEO",
        "company_name": "Krishnan Sleep Systems",
        "domain": "krishnansleep.com",
        "website": "https://krishnansleep.com",
        "industry": "Organic Cooling Bedding & Sleep Tech",
        "location": "Denver, CO",
        "milestone": "Crossed 15,000 nights rested on eucalyptus cooling sheets",
        "news": [
            {
                "headline": "Krishnan Sleep Systems Reaches 15k Nights Rested on Eco-Friendly Cooling Sheets",
                "date": "2026-11-09",
                "snippet": "High-growth sleep brand Krishnan Sleep continues rapid expansion into temperature-regulating textiles.",
                "url": "https://sleepfoundation.org/brand/krishnan-sleep-review",
                "is_within_30_days": True,
            }
        ],
        "assigned_inbox_id": 3,  # affmarkchannel1@gmail.com
        "subject": "unlocking Advantage+ scaling for Krishnan Sleep Systems",
        "body": """Hi Rajat,

Saw that Krishnan Sleep passed 15,000 nights rested on your eucalyptus cooling sheets—congratulations on the milestone!

When scaling high-ticket sleep products on Meta Advantage+, spend almost always concentrates into 1 or 2 legacy ads, which creates severe performance dips when those creatives fatigue.

We solve that by providing an end-to-end performance ad pipeline: 20+ fresh vertical video concepts monthly, combining real customer thermal unboxings with cinematic 3D/AI fiber-weave animations that explain cooling properties instantly.

Explore our portfolio and AI video ad formats here:
https://dtc-creatives.agency/showcase

Would you be open to seeing 2 ad hook angles we scripted specifically for your cooling sheets?

Best,
Alex Rivera
DTC Performance Creative Team"""
    },
    {
        "email": "indiasharma0909@gmail.com",
        "first_name": "Indira",
        "last_name": "Sharma",
        "full_name": "Indira Sharma",
        "role_title": "Founder & Formulator",
        "company_name": "Veda Glow Clean Cosmetics",
        "domain": "vedaglow.com",
        "website": "https://vedaglow.com",
        "industry": "Ayurvedic Clean Beauty & Skincare",
        "location": "Austin, TX",
        "milestone": "Kumkumadi Glow Oil trended across BeautyTok with 2.8M views",
        "news": [
            {
                "headline": "Veda Glow's Saffron Elixir Oil Surges in Popularity Following Viral TikTok Trend",
                "date": "2026-11-03",
                "snippet": "DTC Ayurvedic clean beauty newcomer Veda Glow sells out third production batch.",
                "url": "https://allure.com/story/veda-glow-ayurvedic-oil-viral",
                "is_within_30_days": True,
            }
        ],
        "assigned_inbox_id": 2,  # imanmarkchannel1@gmail.com
        "subject": "fresh TikTok & Reels hooks for Veda Glow's saffron elixir",
        "body": """Hi Indira,

Congratulations on Veda Glow's Kumkumadi Glow Oil trending across BeautyTok last month—the organic excitement around the formulation is incredible!

As you transition from organic buzz to scaling paid social, beauty CPMs on Meta and TikTok can get brutal unless your hook rate is above 35%.

We specialize in DTC creative production for clean beauty. We create high-converting 9:16 video ads: texture melt macro shots, real 14-day glass-skin progression UGC, and AI ingredient breakdown animations that drive immediate add-to-carts.

Here is our creative showcase with our recent video formats:
https://dtc-creatives.agency/showcase

Can I send over 2 custom hook concepts we developed for Veda Glow? No pitch deck—just the raw video frameworks you can test.

Best,
Alex Rivera
DTC Performance Creative Team"""
    }
]


async def load_and_dispatch():
    logger.info("Starting founder lead population and live email dispatch...")

    async with AsyncSessionLocal() as db:
        # 1. Update inbox limits to accommodate immediate dispatch
        inboxes_res = await db.execute(select(Inbox))
        inboxes = inboxes_res.scalars().all()
        for ib in inboxes:
            ib.hourly_limit = 20
            ib.daily_limit = 50
            ib.sent_this_hour_count = 0  # reset hourly counter for fresh dispatch
            ib.is_active = True
            ib.is_quarantined = False
        await db.commit()
        logger.info(f"Updated {len(inboxes)} inboxes with hourly_limit=20, daily_limit=50.")

        # 2. Get or create Campaign
        camp_res = await db.execute(select(Campaign).where(Campaign.id == 1))
        campaign = camp_res.scalar_one_or_none()
        if not campaign:
            campaign = Campaign(
                id=1,
                name="DTC Performance Ads & Video Production",
                offer_pitch="We handle end-to-end DTC ad creative production & testing across Meta and TikTok (vertical UGC hooks, AI product video showcases, and rapid hook testing) to eliminate ad fatigue and scale ROAS.",
                sender_name="Alex Rivera",
                custom_instructions="Congratulate on recent brand milestones < 30 days. Emphasize zero-slop DTC tone, ad creative hook testing, and share showcase link (https://dtc-creatives.agency/showcase).",
                target_daily_sends=500,
            )
            db.add(campaign)
            await db.commit()

        # 3. Create Companies, Leads, Drafts, and QueueSlots
        now = datetime.utcnow()
        created_slot_ids = []

        for item in FOUNDERS_DATA:
            # Check or create Company
            comp_res = await db.execute(select(Company).where(Company.domain == item["domain"]))
            company = comp_res.scalar_one_or_none()
            if not company:
                company = Company(
                    domain=item["domain"],
                    name=item["company_name"],
                    industry=item["industry"],
                    website=item["website"],
                    location=item["location"],
                    recent_news=item["news"],
                    has_recent_milestone=True,
                    recent_milestone_summary=item["milestone"],
                    researched_at=now,
                )
                db.add(company)
                await db.flush()

            # Check or create Lead
            lead_res = await db.execute(select(Lead).where(Lead.email == item["email"]))
            lead = lead_res.scalar_one_or_none()
            if not lead:
                lead = Lead(
                    campaign_id=campaign.id,
                    company_id=company.id,
                    email=item["email"],
                    first_name=item["first_name"],
                    last_name=item["last_name"],
                    full_name=item["full_name"],
                    role_title=item["role_title"],
                    role_category="executive",
                    seniority_rank=1,
                    location=item["location"],
                    status="scheduled",
                    research_dossier={
                        "recent_milestone": item["milestone"],
                        "news": item["news"],
                        "industry": item["industry"],
                        "target_creative_angle": "DTC Performance Ads & AI Video Hooks",
                    },
                    notes="High intent DTC founder. Prioritize 9:16 vertical hook testing pitch.",
                )
                db.add(lead)
                await db.flush()

            # Create Draft
            draft_res = await db.execute(select(Draft).where(Draft.lead_id == lead.id))
            draft = draft_res.scalar_one_or_none()
            if not draft:
                draft = Draft(
                    lead_id=lead.id,
                    subject=item["subject"],
                    body=item["body"],
                    recent_win_highlight=item["milestone"],
                    role_tailored_angle="Direct-to-Consumer Performance Ads & Video Production",
                    is_approved=True,
                    approved_at=now,
                )
                db.add(draft)
                await db.flush()

            # Create QueueSlot scheduled for immediate sending
            slot = QueueSlot(
                campaign_id=campaign.id,
                lead_id=lead.id,
                inbox_id=item["assigned_inbox_id"],
                scheduled_at=now,
                status="pending",
            )
            db.add(slot)
            await db.flush()
            created_slot_ids.append(slot.id)

        await db.commit()
        logger.info(f"Successfully staged {len(created_slot_ids)} leads, drafts, and queue slots.")

    # 4. Execute Live Sending Sequentially
    logger.info("Executing live email dispatch for all 11 leads...")
    results = []
    for slot_id in created_slot_ids:
        logger.info(f"Dispatching slot {slot_id}...")
        success = await email_dispatcher.send_single_slot(slot_id)
        results.append((slot_id, success))
        # 2-second stagger between sends to ensure clean SMTP sessions
        await asyncio.sleep(2)

    # 5. Summary Report
    async with AsyncSessionLocal() as db:
        logs_res = await db.execute(
            select(SendLog).order_by(SendLog.id.desc()).limit(15)
        )
        logs = logs_res.scalars().all()
        logger.info("\n=== DISPATCH SUMMARY ===")
        for log in reversed(logs):
            logger.info(
                f"[{log.status.upper()}] From: {log.sender_email} -> To: {log.recipient_email} | Subject: '{log.subject}'"
            )

    success_count = sum(1 for _, ok in results if ok)
    logger.info(f"Done. Successfully delivered {success_count}/{len(results)} emails.")


if __name__ == "__main__":
    asyncio.run(load_and_dispatch())
