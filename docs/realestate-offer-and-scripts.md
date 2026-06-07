# Real Estate Engine — Offer, Scripts & Compliance Gate

Date: 2026-06-07
Companion to `docs/realestate-revenue-engine-plan.md`. This is the **sellable layer**: the one-page offer, the demo qualification script, the 7-touch follow-up cadence, and the P0 compliance checklist. Everything here is a draft for the operator to approve — no live messaging is wired.

> P0 reminder: do **not** send a single automated message to a real lead until the Compliance Gate (section 4) is satisfied. This is a legal and carrier-trust requirement, not a nicety.

---

## 1. The one-page offer (sales explainer)

**Headline:** *You pay for leads. We make sure not one of them gets ignored.*

**Sub:** We answer, qualify, and follow up on every new lead within 2 minutes — 24/7, by text — and hand your agents the ones ready to talk. You learn nothing new and log into nothing.

**The problem (say it back to them):**
- You buy leads from portals and Facebook. Most never get a fast reply.
- Your agents are in the car, at showings, or asleep when leads come in.
- After 1–2 tries, follow-up stops. The lead goes cold and a competitor calls.

**What we do:**
1. A new lead hits your portal/form → we reply by text in under 2 minutes.
2. We ask 4–5 qualifying questions (timeline, budget, area, financing, buy/sell).
3. Ready-to-talk leads get your agent's booking link, and your agent gets a text with the summary.
4. Quiet leads get a polite 14-day, 7-touch follow-up until they reply or opt out.
5. Every Monday you get a one-page report: leads worked, booked, dead, average response time.

**Why us, not a CRM or an ISA:**
- A CRM is a tool *you* still have to run. We're done-for-you.
- A human ISA costs $2,000–4,000/month, sleeps, and quits. We don't.
- We plug into the lead flow you already have — no rip-and-replace.

**Pricing (anchor + tiers):**
- **Pilot — $X for 14 days.** We run your busiest lead source. Money back if we don't beat your current response time.
- **Core — $750/mo:** one lead source, responder + 7-touch follow-up + weekly report.
- **Growth — $1,500/mo:** multiple sources + onboarding flow + richer cadences.
- **Scale — $2,500/mo:** multi-agent routing, priority, custom scripts.
- One-time setup: $500–$1,000.

**Risk reversal:** Pilot is refundable if we don't beat your current median response time. Cancel anytime; no lock-in.

**Call to action:** *Text our live demo number right now and watch it qualify you in real time.* → [demo number]

> Operator TODO before use: pick the product name (candidates: NitsyClaw Reply / LeadHold / ListingDesk / FollowUpEngine), set the pilot price `$X`, stand up the live demo number, insert one real proof stat once the first pilot produces it. Remove the ISA cost figures if you can't stand behind them locally — they're illustrative.

---

## 2. Demo / live qualification script

Tone: warm, human, brief. Never quotes prices, never makes promises, never claims to be a licensed agent. Identifies as an assistant if asked. One question at a time.

**Opener (within 2 min of lead):**
> "Hi {first_name}, thanks for reaching out about {property_or_area}! I'm {AgencyName}'s assistant — I can get you to the right agent fast. Mind if I ask a couple quick questions so they can actually help? 🙂"

**Q1 — Intent:** "Are you looking to **buy**, **sell**, or **both** right now?"
**Q2 — Timeline:** "Roughly when are you hoping to make a move — **this month**, **1–3 months**, or **just exploring**?"
**Q3 — Area/property:** "Which **area or neighbourhoods** are you focused on?" (buyer) / "What's the **property address or suburb**?" (seller)
**Q4 — Budget/price (soft):** "Do you have a **price range** in mind? Totally fine if it's rough." *(Never state or confirm a price back as advice.)*
**Q5 — Financing (buyer):** "Are you **paying cash**, **already pre-approved**, or **still sorting financing**?"

**Branch — qualified** (timeline ≤ 3 months AND contactable):
> "Perfect — you're exactly who {AgentName} loves to help. Here's their calendar to grab a quick call: {booking_link}. I'll let them know you're coming so they're ready for you. Anything else I can pass along?"
> → notify agent with summary.

**Branch — nurture** (exploring / >3 months / vague):
> "Got it — no rush at all. I'll have {AgentName} send you a couple of options that fit, and check in now and then. If anything changes, just text me here. 👍"
> → enter 7-touch cadence.

**Branch — not a fit / wrong number / opt-out:**
> "No problem at all — I'll take you off the list. If you ever need us, we're here. Reply STOP anytime." → suppress permanently.

**Guardrails (hard rules for the AI):**
- Never quote, confirm, or negotiate price/commission. Defer to the agent.
- Never give legal, financial, or valuation advice.
- Never claim a property is available/sold without agent confirmation.
- If the lead is upset, confused, or asks something off-script → hand to a human immediately.
- If asked "are you a bot/AI?" → "I'm {AgencyName}'s assistant — happy to get you a real person right now if you'd like!"

---

## 3. The 7-touch / 14-day follow-up cadence

Stops instantly on any reply or opt-out. Respects quiet hours (no sends 9pm–8am local). Each touch is short, friendly, and gives an easy out.

| # | Day | Channel | Message intent | Draft |
| --- | --- | --- | --- | --- |
| 1 | 0 | text | Instant first reply | (qualification opener above) |
| 2 | 1 | text | Gentle bump | "Hi {first}, still keen to look around {area}? Happy to line up a few options whenever you're ready." |
| 3 | 3 | text | Value, not ask | "A couple of {area} listings just came up that might suit. Want me to send them over?" |
| 4 | 5 | text | Soft question | "Quick one — are you still actively looking, or has the timing shifted? Either's totally fine." |
| 5 | 8 | text | Helpful resource | "No pressure at all. If it helps, I can have {AgentName} send a quick {buying/selling} guide for {area}. Want it?" |
| 6 | 11 | text | Re-engage | "Still here whenever you need us, {first}. Want me to check in again next month instead?" |
| 7 | 14 | text | Polite close / breakup | "I'll pause here so I'm not a pest 🙂. Whenever you're ready to look at {area}, just text this number and I'll jump straight on it. Reply STOP to opt out." |

Rules: any inbound reply → exit cadence, route to qualification/agent. "STOP"/opt-out → permanent suppression. No more than one touch per day. All copy is templated and human-approved; the AI personalises only the bracketed fields.

---

## 4. Compliance gate (P0 — must clear before any real lead)

Automated SMS/WhatsApp to consumers is heavily regulated. Clearing this is a launch blocker, not optional. **Verify current rules with a qualified source for the operating jurisdiction — the notes below are a starting checklist, not legal advice, and are `UNVERIFIED`.**

**United States (most likely market for portal-lead brokerages):**
- [ ] **A2P 10DLC registration** — register the brand + campaign with the carriers (via the SMS provider, e.g. Twilio/Telnyx) before sending application-to-person texts. Unregistered traffic gets filtered/blocked.
- [ ] **TCPA consent** — ensure there is prior express consent to text the lead. Inbound leads who submitted a form with consent language are the safest starting point; purchased lists are high-risk.
- [ ] **Opt-out honoured** — STOP/UNSUBSCRIBE must immediately and permanently suppress. Provide opt-out language in the first message.
- [ ] **Quiet hours** — no messages outside ~8am–9pm local.
- [ ] **Identify the sender** — messages must make clear who is texting.

**WhatsApp (if used):**
- [ ] Business messaging policy compliance + opt-in; template-message rules for business-initiated messages; opt-out path. Treat WhatsApp as secondary to SMS (platform policy volatility — see plan §9).

**Cross-cutting:**
- [ ] **Per-agency data isolation** — one agency's leads never visible to another (reuse tenant-boundary work).
- [ ] **Minimal retention + a simple data-handling one-pager / DPA** for agency clients.
- [ ] **Consent provenance logged** — record where/when each lead consented, in case of dispute.

**Decision needed from operator before wiring anything live:**
1. Which country/state is the first market? (Determines the exact rules.)
2. Which SMS provider? (Determines the 10DLC registration path.)
3. Are pilot leads inbound-with-consent only? (Strongly recommended for launch.)

---

## Operator addendum (per `CLAUDE.md`)

1. **Next best revenue move:** Lock the product name + pilot price `$X`, stand up the live demo number, and send section 1 to 10 target brokerage principals this week. The offer is now concrete enough to sell; the only thing between here and the first dollar is putting it in front of buyers.
2. **Failure-prevention move:** Answer the three decisions in section 4 and complete the A2P 10DLC + consent checklist before any automated message touches a real lead. Skipping this risks fines and carrier bans that end the business.
3. **Recommendation:** Do the section 4 decisions first (one focused session — pick market, pick SMS provider, commit to inbound-consent-only pilots), because the pilot price and offer wording in section 1 depend on what you can compliantly deliver. Safety unblocks revenue here; it doesn't compete with it.
