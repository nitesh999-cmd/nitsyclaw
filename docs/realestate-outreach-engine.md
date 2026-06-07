# Real Estate Engine — Cold-Outreach Engine

Date: 2026-06-07
Companion to `docs/realestate-revenue-engine-plan.md` and `docs/realestate-offer-and-scripts.md`. This document is the **acquisition layer**: how to find the right 50 brokerage principals, what to say across 4 touches, how to handle every reply type, and how many contacts per day are needed to land the first 5 pilots.

> Honesty note (per `CLAUDE.md` and `AUDIT_STANDARD.md`): funnel rates and benchmark metrics cited below are rules of thumb derived from general B2B cold-outreach practice. They are labelled `UNVERIFIED` and must be tested against your actual results before being used as planning inputs. Do not forecast a specific number of clients from these figures — treat them as directional only.

> Compliance note: all cold email must comply with CAN-SPAM (US) or the equivalent in your operating jurisdiction. A CAN-SPAM checklist is included in section 3. Cold LinkedIn DMs are lower-risk legally but subject to LinkedIn's own messaging limits. Verify current rules for your market; the notes below are a starting checklist, not legal advice.

---

## 1. Ideal Customer Profile (ICP) + Targeting Filters

### Who to target

The right brokerage principal has three things happening at once:

1. **They are already spending money on leads** — they have a Zillow Premier Agent subscription, a Realtor.com connection plan, active Facebook lead ads, or a web form that routes to an email inbox. This proves both budget and a live problem. A brokerage that does not buy leads is not the right first customer.
2. **They have enough agents to feel the pain but not enough to staff a solution** — 3–25 agents is the sweet spot. Fewer than 3 and there is no volume to automate. More than 25 and they likely already have an ISA or a dedicated operations person.
3. **The principal is reachable and makes decisions** — this is the owner, broker-of-record, or operating partner, not a salaried agent. They control the budget and feel the lead-waste pain personally.

### Firmographic filters

Use these as hard filters when building a list. A prospect who fails more than one is probably not worth a first contact:

| Filter | In | Out |
| --- | --- | --- |
| Brokerage size | 3–25 agents (agents count visible on website or confirmed by outreach) | Solo practitioners; large franchises (RE/MAX corp, Keller Williams corporate) |
| Lead-buying signal | Active Zillow/Realtor.com profile with reviews, or Facebook Ads Library shows active lead-form ads, or website has a visible lead-capture form | Referral-only boutiques; commercial-only shops |
| Geography | Residential focus, any market | Commercial only, luxury-only with <10 transactions/year |
| Tech sophistication | Has a website (even basic); principal is active on LinkedIn or Facebook | No web presence at all (very hard to reach and hard to trust with automation) |
| Decision-maker reachability | Principal's name + email or LinkedIn findable | Only a generic "info@" address and no named principal visible |

### Where to find them

**A. Zillow / Realtor.com agent directories**

Search: `site:zillow.com/profile "team" OR "brokerage" [city]` — look for team leaders or brokers with 10–100 reviews (indicates active volume). On Realtor.com, filter by "Teams" in the agent directory for a given metro. Agents with a large number of recent sales but listed on a small team are strong candidates.

Zillow Premier Agent profiles often show the brokerage name and sometimes a phone number. Cross-reference the brokerage name to get to the principal.

**B. Google Maps**

Search: `real estate agency [city]` or `real estate brokerage [city]`. Filter by 4+ stars, 20+ reviews (indicates active business). Click each result: look for a "team" size signal in the About section or review count. Avoid the obvious franchise chains at the top (century21.com, coldwellbanker.com, etc.) — target independently branded shops or small named franchisees who operate autonomously.

**C. Local real estate boards and MLS directories**

Most metro areas have a public-facing member directory on the local association of REALTORS site. Search for "broker" or "qualifying broker" designations — these are principals. Example search form: `[metro] association of realtors member directory broker`.

**D. LinkedIn**

Search filter: `People > Real Estate > Title: "Broker" OR "Broker/Owner" OR "Managing Broker" OR "Principal Broker" > Location: [target metro]`. Narrow to 2nd-degree connections first for warmer outreach. Check their "About" section and current company page for agent headcount signal.

LinkedIn Sales Navigator (if available): `Company headcount: 2–25 > Industry: Real Estate > Seniority: Owner, Partner, C-Level`. This is the highest-precision filter. Not required for early list-building — the free search gets you started.

**E. Facebook**

Facebook Ads Library (`facebook.com/ads/library`): search by advertiser name in your target metro, filter to "Real Estate" category. Any brokerage running active lead-form ads is a confirmed lead-buyer. Capture the page name, find the principal via the Facebook page's About section or linked website.

Also: Facebook groups for local real estate (`[city] real estate professionals`, `[city] realtors`). Lurk before posting. Principals who post questions about lead follow-up or ISA costs are self-identifying as your ICP.

### What signals bump a prospect to the top of your list

Send these prospects first, before everyone else:

- Their Facebook Ads Library page shows a lead-form ad that has been running for 30+ days (money being spent, problem is chronic).
- They have 50+ Zillow reviews (volume), but their team page on Zillow or their website lists fewer than 10 agents (volume without the headcount to follow up).
- They have posted in a real estate Facebook group asking about lead follow-up, ISAs, or response time in the last 90 days.
- Their Google listing shows "usually responds in a few hours" (self-reported slow response — the pain is already visible to them).
- A LinkedIn post from the principal mentions lead cost, conversion, or follow-up frustration.

---

## 2. 50-Prospect Target-List Template

### How to use this

Build and maintain this as a Google Sheet (one tab = active prospects, one tab = archive). Fill one row per brokerage principal. The operator fills all rows beyond the three examples below. Aim for 50 rows before starting the sequence — enough to run a real cadence without running out of prospects mid-week.

### Column definitions

| Column | What to put in it |
| --- | --- |
| **Brokerage Name** | The trading name of the brokerage (not the franchise brand) |
| **Principal Name** | First + last name of the owner/broker-of-record making budget decisions |
| **Email** | Direct email if findable (website contact, LinkedIn, email-finder tool). Label "unverified" until confirmed as deliverable |
| **Phone** | Mobile preferred if findable from public profile or site. For DMs only — do not cold-call without consent in regulated markets |
| **# Agents (est.)** | Estimated from website team page or MLS directory. Flag if guessed |
| **Lead Source Signal** | What evidence of lead-buying you found: "Zillow Premier Agent", "FB lead ads (Ads Library)", "web lead form", "Realtor.com profile", "unknown" |
| **Website** | Full URL |
| **LinkedIn / Facebook** | Profile URL for the principal (LinkedIn) or brokerage page (Facebook) |
| **Status** | One of: `Not contacted` / `Touch 1 sent` / `Touch 2 sent` / `Touch 3 sent` / `Touch 4 (breakup) sent` / `Replied — nurturing` / `Call booked` / `Pilot started` / `Dead — not interested` / `Dead — no response` |
| **Last Touch Date** | ISO date (YYYY-MM-DD) of last outreach |
| **Next Action** | What to do next and when: e.g. "Send Touch 2 on 2026-06-09" |
| **Notes** | Personalisation hooks found, reply content, call notes, objections raised |

### Table header + 3 example rows

> ALL DATA BELOW IS PLACEHOLDER. These three rows are invented examples to show the format. None of the businesses, names, email addresses, phone numbers, or URLs below are real. Do not contact anyone using this data. The operator replaces these rows with real prospects.

| Brokerage Name | Principal Name | Email | Phone | # Agents (est.) | Lead Source Signal | Website | LinkedIn / Facebook | Status | Last Touch Date | Next Action | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| [EXAMPLE] Riverside Property Group | [EXAMPLE] Sarah M. | [EXAMPLE] sarah@riverside-pg.example.com | [EXAMPLE] +1-555-0101 | 8 | FB lead ads (Ads Library — 2 active lead-form campaigns) | [EXAMPLE] riverside-pg.example.com | [EXAMPLE] linkedin.com/in/sarah-example | Not contacted | — | Send Touch 1 on 2026-06-08 | Running "homes in [suburb]" lead-form ad for 45+ days. 67 Zillow reviews, 8 agents listed on site. Good volume-to-team ratio. |
| [EXAMPLE] Northside Realty Partners | [EXAMPLE] James T. | [EXAMPLE] james@northsiderealty.example.com | [EXAMPLE] +1-555-0202 | 14 | Zillow Premier Agent + web lead form | [EXAMPLE] northsiderealty.example.com | [EXAMPLE] facebook.com/northsiderealty.example | Touch 1 sent | 2026-06-07 | Send Touch 2 on 2026-06-09 | 14-agent shop, owner name on site, direct email guessed from pattern (unverified). Posted in FB group about ISA costs 3 weeks ago — strong signal. |
| [EXAMPLE] Bay Area Homes Team | [EXAMPLE] David L. | [EXAMPLE] david@bayareahomesteam.example.com | [EXAMPLE] +1-555-0303 | 5 | Realtor.com connection plan + web form | [EXAMPLE] bayareahomesteam.example.com | [EXAMPLE] linkedin.com/in/david-example | Replied — nurturing | 2026-06-06 | Follow up with pilot offer on 2026-06-08 | Replied "tell me more" to Touch 1. Small team, high volume. Principal mentioned response time is a pain. Use pilot pitch script. |

*The operator fills rows 4–50 with real prospects found using the targeting method in section 1.*

---

## 3. 4-Touch Cold Email + DM Sequence

### Before you send: CAN-SPAM compliance checklist (US)

Complete this before the first send. If your market is outside the US, verify the equivalent law.

- [ ] **Identify the sender clearly** — every email must show your real name and business name. No fake personas.
- [ ] **Accurate subject line** — no deceptive or misleading subject lines. (The subjects below are factual and non-deceptive.)
- [ ] **Physical mailing address** — include in the email footer (required by CAN-SPAM). A PO box is acceptable.
- [ ] **Opt-out mechanism** — every email must contain a clear unsubscribe link or instruction (e.g. "reply with 'unsubscribe' and I'll remove you immediately").
- [ ] **Honour opt-outs within 10 business days** — remove anyone who opts out and do not re-contact them.
- [ ] **No purchased lists without consent** — sourcing emails from public directories (websites, LinkedIn) is different from buying a list; understand the distinction for your market.
- [ ] **LinkedIn DMs** — not covered by CAN-SPAM but subject to LinkedIn's messaging limits. Keep volume reasonable (under 20 InMails/day on free accounts). Do not scrape or automate LinkedIn sending — violations risk account bans.

---

### Tone notes for the whole sequence

- Value-first, not salesy. Every touch gives something before it asks for anything.
- Specific to their business, not generic. Use at least one personalisation token per touch.
- Short. Principals are busy. If it takes more than 30 seconds to read, it is too long.
- Soft CTA. The goal of every touch is a reply or a 10-minute call — not a signed contract.
- No pressure. The offer has a risk reversal (refundable pilot) — lean on that, not urgency.

---

### Touch 1 — Day 0

**Email version**

Subject: `{BrokerageName} — your leads after hours`

---

Hi {FirstName},

I was looking at {BrokerageName}'s Zillow profile — {review_count} reviews is solid volume for a {agent_count}-person team.

One thing I noticed: most agencies your size have the same problem. New leads come in at 10pm on a Tuesday, nobody replies until morning, and by then there are two other agents in the conversation.

We built a system that answers every new lead by text in under 2 minutes — 24/7 — then qualifies them and hands the ready-to-talk ones to your agents with a booking link. The rest get a polite 14-day follow-up so nothing disappears.

It's not a CRM your team has to log into. We run it for you.

If you're curious, the easiest thing is to text our live demo number: {demo_number}. It'll qualify you in real time so you can see exactly what your leads experience.

Otherwise, if a 10-minute call makes more sense, happy to find a time.

{YourName}

*{YourTitle} | {YourBusinessName} | {Address}*
*Reply with "unsubscribe" and I'll remove you immediately.*

---

**LinkedIn / Facebook DM version** *(shorter — aim for under 100 words)*

---

Hi {FirstName} — I looked at {BrokerageName}'s Zillow profile and noticed the volume you're doing.

Most teams your size lose leads simply because nobody replied fast enough after hours. We answer every new lead by text in under 2 minutes, qualify them, and hand your agents the ready-to-talk ones — done for you, no new software.

Easiest way to see it: text {demo_number} and watch it work in real time. Worth a look?

---

---

### Touch 2 — Day 2

**Email version**

Subject: `quick follow-up — {BrokerageName} leads`

---

Hi {FirstName},

Just following up on my note from {day_0_date}. Wanted to add one piece of context in case it's useful:

The reason most brokerages lose portal leads isn't agent effort — it's timing. {Lead_source, e.g. Zillow} leads that don't get a reply within the first 5 minutes are significantly more likely to have already contacted another agent by the time someone calls back. (Rule of thumb in the industry — `UNVERIFIED`, but it maps to what most principals tell us they see.)

We built the responder specifically so your agents never have to race the clock — the AI handles the first 2 minutes, and your agent walks into a warm conversation.

No pitch here — if you want to see the actual response your leads would get, text {demo_number}. It takes about 90 seconds.

{YourName}
*{Address} | Reply "unsubscribe" to opt out.*

---

**LinkedIn / Facebook DM version**

---

Hi {FirstName} — following up from my earlier message.

One thing worth knowing: the speed gap (reply in 2 min vs 30 min) is where most portal leads are lost — not from lack of follow-up later. Our system covers that first window automatically.

Happy to show you the exact messages your leads would receive — text {demo_number} and experience it yourself. Takes 90 seconds.

---

---

### Touch 3 — Day 5

**Email version**

Subject: `what the first 14 days looks like for {BrokerageName}`

---

Hi {FirstName},

Third and second-to-last note from me — I'll keep it short.

Here is what a 14-day pilot with us actually looks like, in plain terms:

- **Day 1:** We take one lead source (your busiest — usually {lead_source_signal}), set up the responder and the qualification script for your market, and wire it in.
- **Day 1–14:** Every new lead gets an instant text reply. Qualified leads get your agent's booking link. The rest get a polite follow-up cadence.
- **Day 14:** You get a one-page report: how many leads came in, how many replied, how many booked.

Pilot cost: {pilot_price}. If we don't beat your current median response time, it's refundable. Cancel anytime after — no lock-in.

If the timing is off or it's not the right fit, just let me know — I won't keep following up.

If it sounds worth exploring, text {demo_number} or reply here and we'll find 10 minutes.

{YourName}
*{Address} | Reply "unsubscribe" to opt out.*

---

**LinkedIn / Facebook DM version**

---

Hi {FirstName} — last substantive note before I leave you alone.

14-day pilot: we wire the responder to your busiest lead source, run it for two weeks, and give you a one-page report at the end. Cost is {pilot_price}, refundable if we don't beat your current response time.

If now's not right, no problem. If you want to see how it works first: text {demo_number}.

---

---

### Touch 4 — Day 9 (Breakup)

**Email version**

Subject: `closing the loop — {BrokerageName}`

---

Hi {FirstName},

I'll wrap up here — I don't want to be in your inbox if this isn't relevant.

If lead response time or follow-up discipline is a problem you're actively trying to solve, we're worth 10 minutes. Text {demo_number} or reply and I'll make it easy.

If the timing's off or you've sorted it another way — completely fine. I'll take you off my list.

Either way, good luck with the {current_season} market in {city}.

{YourName}
*{Address} | Reply "unsubscribe" to be removed permanently.*

---

**LinkedIn / Facebook DM version**

---

Hi {FirstName} — closing the loop. If lead follow-up is something you're working on, I'm at {demo_number}. If not, no hard feelings — good luck with the {current_season} market.

---

---

## 4. Reply-Handling Playbook

Every reply is progress. The goal of every response is to move the conversation toward one concrete next step: the 10-minute call, or the demo number, or the pilot. Do not try to close in a reply — close on the call.

Keep replies short. Match their energy. If they're brief, be brief.

---

### "Not interested"

> "Completely fine — I'll take you off the list. If lead follow-up ever becomes something you want off your plate, feel free to reach back out. Good luck with the business."

Then mark them "Dead — not interested" in the sheet. Do not follow up again unless they re-initiate. Remove them from any future cadences.

*Why this works:* Gracious exits preserve reputation. Real estate is a small world — word travels.

---

### "How much does it cost?"

> "Glad you asked — happy to give you the full picture. The quick version: we start with a 14-day pilot at {pilot_price}, refundable if we don't beat your current response time. After that it's {Core: $750/mo} for one lead source all-in, or {Growth: $1,500/mo} if you want multiple sources and more cadences. No setup costs buried in fine print.
>
> The better question is whether it'd pay for itself — one extra closed deal from a lead that would have gone cold covers a lot of months. Happy to show you the math on a quick call. Does {day/time} work, or is another time better?"

*Why this works:* Answers directly (no coyness), frames ROI before price lands as an objection, moves to a call with a specific ask.

---

### "We already use a CRM"

> "That's fine — we don't replace your CRM and we don't ask you to change anything. We sit in front of it: the AI answers new leads in the first 2 minutes, qualifies them, and hands the ready-to-talk ones to your agents with a summary. Whatever CRM you use gets the outcome, not a new tool to learn.
>
> The gap we're filling is usually the first 2 minutes and the 14-day follow-up for the quiet ones — most CRMs need a human to trigger that. Does that make sense? Happy to show you on a quick call."

*Why this works:* Removes the objection by agreeing — we're not a competitor to the CRM. Redirects to the actual gap.

---

### "Send me some info"

> "Sure — let me send you the two things that are actually useful rather than a brochure:
> 1. A one-page explainer of what we do and what a pilot looks like — I'll attach it to this reply.
> 2. Our live demo number: {demo_number}. Text it and you'll see exactly what your leads would experience. It takes 90 seconds.
>
> I'll follow up in a couple of days. If you want to talk through it before then, just reply."

Then send the one-page offer from `docs/realestate-offer-and-scripts.md` section 1 as a clean PDF or inline text. Mark the prospect "Replied — nurturing" and schedule a follow-up in 2 days.

*Why this works:* "Send me info" is often a soft no, but sometimes genuine interest. Give them something real and move quickly to the demo — that's the actual conversion tool.

---

### "We have an ISA already"

> "Makes sense — a good ISA is hard to find. Two questions, genuinely:
> 1. Does your ISA cover leads that come in after hours and on weekends, at the same speed?
> 2. What happens to leads when they call in sick or have a heavy day?
>
> We're not a replacement — some teams use us as the overnight and weekend layer so the ISA handles the warm conversations during business hours. Happy to walk through how that'd work in 10 minutes if it sounds useful."

*Why this works:* Respects the existing relationship instead of attacking it. Opens a "both" door — we extend the ISA rather than replace them. The two questions surface the real gap without being combative.

---

### "Tell me more" / Positive interest

> "Great — happy to. Easiest path: text our demo number {demo_number} right now and you'll see exactly what your leads experience when they come in. Takes 90 seconds.
>
> After that, if you want to talk through whether it's a fit for {BrokerageName}, I can do a 10-minute call — no deck, just a real conversation. Does {specific day/time} work?"

Then send a calendar link or offer two specific times. Do not leave the CTA open-ended ("let me know when you're free") — that stalls. Propose a time.

*Why this works:* Converts interest to action before it cools. The demo number is the product doing the selling. The call closes.

---

## 5. Weekly Outreach Cadence + Metrics

### Daily send target and cadence logic

The binding constraint is sales throughput (per `realestate-revenue-engine-plan.md` §5). This section tells you exactly what to do each week to keep the pipeline moving.

**Daily send targets:**

| Day | Actions |
|---|---|
| Monday | Research + add 10 new prospects to the sheet. Send Touch 1 to 5–7 prospects. |
| Tuesday | Send Touch 1 to 5–7 more. Reply to any responses from Monday's sends. |
| Wednesday | Send Touch 2 to everyone who received Touch 1 on Monday and has not replied. Handle replies. |
| Thursday | Send Touch 1 to 5–7 new prospects. Handle replies. |
| Friday | Send Touch 2 to Tuesday's Touch 1 recipients. Send Touch 3 to Monday's Touch 2 recipients. Handle replies. |
| Weekend | Rest or batch-research next week's prospects. Do not send cold emails on Saturday/Sunday — open rates are lower and it signals desperation. |

**Weekly total sends:** roughly 15–20 new Touch 1 sends per week across Monday/Tuesday/Thursday.

Aim to maintain 50 active prospects in the sheet at all times. As prospects move to "dead" or "pilot started", add new ones to replace them.

---

### What to track (your weekly metrics)

Maintain a simple weekly log — add a new row each Friday. These are the only numbers that matter:

| Metric | Definition | Where to get it |
|---|---|---|
| **Sent** | Touch 1 emails + DMs sent this week | Count from the sheet |
| **Opened** | Emails opened (if your email tool tracks opens — e.g. Gmail + Streak, HubSpot free, Mailtrack) | Email tool |
| **Replied** | Any reply, positive or negative | Count from the sheet |
| **Calls booked** | 10-min calls scheduled | Calendar |
| **Demo number texts** | Inbound texts to the demo number this week | Bot/platform log |
| **Pilots started** | New 14-day pilots paid and wired | Sheet / payment record |
| **Retainers active** | Total paying agencies on retainer (cumulative) | Sheet |

---

### Funnel math to land the first 5 pilots

These are rules of thumb based on typical B2B cold-outreach benchmarks. They are `UNVERIFIED` — your actual numbers will differ. Track for 4 weeks and recalibrate.

Assumed rates (adjust as you measure):

| Stage | Assumed rate (`UNVERIFIED`) | What it means |
|---|---|---|
| Cold email open rate | 30–40% | Aggressive personalisation should beat generic; track |
| Reply rate (any reply) | 5–10% of sends | Realistic cold B2B; personalised gets toward 10% |
| Positive reply rate | ~2–4% of sends | "Tell me more" / "how much" / "interested" |
| Call-booked rate | 50–70% of positive replies | If they replied positively, most will take a call |
| Pilot conversion from call | 20–40% of calls | Varies heavily by how well the call is run |

**Funnel math to reach 5 pilots:**

Working backwards from 5 pilots:

- 5 pilots ÷ 30% call-to-pilot rate = **~17 calls needed**
- 17 calls ÷ 60% positive-reply-to-call rate = **~28 positive replies needed**
- 28 positive replies ÷ 3% positive reply rate = **~930 total sends needed**

At 15–20 Touch 1 sends per week, 930 sends = roughly 47–62 weeks at that pace. That is too slow for a 5-pilot goal.

**What this means in practice:** the funnel math tells you that raw volume alone at 15–20/week will not get you to 5 pilots in 90 days. The levers are:

1. **Increase send volume** — ramp to 30–40 new contacts per week as the list-building gets faster.
2. **Improve reply rate** — personalisation, better targeting (use the high-signal prospects first), and the demo number as a CTA are the highest-leverage improvements.
3. **Use warm channels alongside cold** — Facebook group posts (value-first, not pitchy), LinkedIn engagement on principals' posts, and asking every pilot agency for one referral all compress the funnel dramatically.
4. **Accelerate the demo-to-call path** — the demo number is the product selling itself. Every touch should push toward it.

Revised realistic target: 30–40 sends/week + 1–2 warm referrals/month + active demo number promotion = **5 pilots in 60–90 days** is achievable; `UNVERIFIED`, but directionally sound.

---

### The 90-day ramp in weekly buckets

| Weeks | Focus | Key actions |
|---|---|---|
| 1–2 | Setup | Build the 50-person list; set up the tracking sheet; verify the demo number is live; confirm compliance checklist (section 3) is cleared; send the first 10–15 Touch 1s. |
| 3–4 | First responses | Run the full cadence; handle replies using section 4; aim for first 2–3 calls booked; refine subject lines based on open data. |
| 5–8 | Pilot conversions | First paid pilot should start by week 6–8; deliver it carefully — this is your future case study; keep outreach running in parallel (do not stop prospecting once a pilot starts). |
| 9–12 | Expand | Convert pilot to retainer; use week-6 case study (even rough numbers) as social proof in new outreach; ask pilot agency for one warm intro; start 3 more pilots. |

---

## 6. Operator Addendum

*(Per `CLAUDE.md` and the pattern established in companion documents.)*

1. **Next best revenue move:** Build the 50-person tracking sheet using the ICP filters and source methods in section 1, set up the demo number so it is live, and send the first 10 Touch 1 emails this week. Nothing in this document earns money until a real principal reads a real email. The sheet and the first sends are the unlock — everything else here is support material for after replies start coming in.

2. **Failure-prevention move:** Complete the CAN-SPAM compliance checklist in section 3 before sending any email, and confirm the compliance gate in `docs/realestate-offer-and-scripts.md` section 4 before any pilot goes live with real leads. Cold email non-compliance is lower-stakes than automated SMS (CAN-SPAM penalties are per-violation but manageable if you fix quickly), but the demo number and the pilot's automated messaging have the higher-stakes TCPA / A2P exposure. Do not let outreach success outpace the compliance readiness of the delivery system.

3. **Recommendation:** Do the compliance checklist decision first (one focused session — it does not take long and it is a known requirement), then build the list and send the first 10 emails the same day or the next morning. The list-building and first sends are the revenue unlock; the compliance check removes the risk that a successful sales conversation leads to a pilot you cannot deliver safely. Sequence: compliance decision → list-building → first sends → handle replies using section 4. Do not wait for a perfect 50-name list before sending — 10 targeted sends today beats 50 sends next month.
