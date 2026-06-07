# Real Estate Workflow Spec — End-to-End No-Code Architecture

Date: 2026-06-07
Companion to: `docs/realestate-revenue-engine-plan.md`, `docs/realestate-offer-and-scripts.md`
Status: Implementation spec for the first pilot. No code changed. Not live.

> Honesty rule: every reference to existing code in this document was verified against real files read in this session. File paths are cited. External pricing/limits are labelled `UNVERIFIED`. Nothing is claimed to be live.

---

## 1. Architecture Overview

The diagram below shows the full flow from a new lead arriving at an agency's lead source through to the weekly report. Each box is labelled with which layer owns it.

```
LEGEND
[EXISTING]  = NitsyClaw engine already running in the repo
[NO-CODE]   = Make / n8n / Zapier automation (no new code)
[T1–T6]     = New small-code tickets from Phase 7 build plan
[EXTERNAL]  = Third-party SaaS (Cal.com, Twilio/Telnyx, etc.)
```

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         LEAD SOURCES (agency-side)                       │
│  Portal email forward │ Facebook Lead Ads │ Web form │ Zapier webhook     │
└────────────┬──────────────────┬───────────────────┬────────────┬─────────┘
             │                  │                   │            │
             ▼                  ▼                   ▼            ▼
┌────────────────────────────────────────────────────────────────────────┐
│  INTAKE NORMALIZATION LAYER  [NO-CODE: Make / n8n / Zapier]            │
│  - Parse portal email → extract fields                                 │
│  - Pull FB Lead Ads fields via native connector                        │
│  - Receive web-form POST, map fields                                   │
│  - Emit canonical LeadPayload JSON (schema in §2)                     │
│  - POST to T1 intake endpoint (with HMAC secret header)               │
└────────────────────────────────┬───────────────────────────────────────┘
                                 │  POST /api/leads/intake
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│  T1 — LEAD INTAKE ENDPOINT  [NEW CODE: apps/dashboard API route]       │
│  - Validate HMAC secret, rate-limit, dedupe by phone+source            │
│  - Write lead record to new `re_leads` table (per-agency tenant)       │
│  - Trigger first WhatsApp/SMS message via bot's send path              │
└────────────────────────────────┬───────────────────────────────────────┘
                                 │  Outbound first-touch message
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│  EXISTING WHATSAPP / SMS ENGINE  [EXISTING: apps/bot]                  │
│  WhatsAppClient (packages/shared/src/whatsapp/client.ts)               │
│  Router (apps/bot/src/router.ts) — handles inbound replies             │
│  Scheduler (apps/bot/src/scheduler.ts) — fires due reminders (cron)   │
│  Loop breaker + echo guard — prevents spam/runaway sends               │
└──────────────┬──────────────────────────────────────────┬──────────────┘
               │  Inbound lead replies                    │  Scheduled touches
               ▼                                          ▼
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│  T2 — QUALIFICATION ENGINE       │   │  T4 — FOLLOW-UP CADENCE          │
│  [NEW CODE: apps/bot + shared]   │   │  [NEW CODE: reuses reminders]    │
│  Config-driven Q&A state machine │   │  7-touch / 14-day schedule       │
│  per agency (JSON config, not    │   │  Stops on reply / STOP keyword   │
│  hardcoded). Safety gate: never  │   │  Quiet-hours gate                │
│  quote price / make promises.    │   │  (packages/shared/src/           │
│  Reads/writes `re_leads` status. │   │   features/03-reminders.ts +     │
└──────────┬───────────────────────┘   │   scheduler.ts extended)         │
           │                           └──────────────────────────────────┘
           │  Branch on qualification result
           ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        OUTCOME BRANCH                                  │
│                                                                        │
│  QUALIFIED (timeline ≤ 3 months, contactable)                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  T3 — HAND-OFF + AGENT NOTIFY  [NEW CODE: bot router + shared] │    │
│  │  Send booking link (Cal.com/Calendly) to lead                  │    │
│  │  Notify agent by WhatsApp/SMS with lead summary                │    │
│  │  Update `re_leads` status → "qualified"                        │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                        │
│  NURTURE (exploring / >3 months / vague)                               │
│  → Update status → "nurture", enqueue T4 follow-up cadence             │
│                                                                        │
│  OPT-OUT / WRONG NUMBER                                                │
│  → Update status → "suppressed", permanent suppress flag               │
└────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌────────────────────────────────────────────────────────────────────────┐
│  OUTCOME STORE  [NEW TABLES, existing Postgres / Drizzle stack]        │
│  re_leads + re_messages + re_agency_config                             │
│  Per-agency tenant isolation (agency_id on every row)                 │
└────────────────────────────────┬───────────────────────────────────────┘
                                 │  Weekly query
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│  T5 — WEEKLY REPORT GENERATOR  [NEW CODE: apps/dashboard + shared]    │
│  Per-agency: leads worked / qualified / booked / dead / response time  │
│  Delivered: email to agency principal (or shared Google Sheet)         │
│  Tenant isolation: one agency's data never visible to another          │
└────────────────────────────────────────────────────────────────────────┘
                                 │  Operator view
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│  T6 — OPERATOR CONSOLE  [NEW CODE: apps/dashboard]                    │
│  Solo operator sees all agencies: SLA, usage vs cap, failures          │
└────────────────────────────────────────────────────────────────────────┘
```

**Which parts exist today vs which are new:**

| Layer | Status | Where in repo |
|---|---|---|
| WhatsApp send/receive | Existing | `apps/bot/src/index.ts`, `router.ts`, `wwebjs-client.ts` |
| Reminders / scheduler | Existing | `apps/bot/src/scheduler.ts`, `packages/shared/src/features/03-reminders.ts` |
| Loop breaker / echo guard | Existing | `apps/bot/src/whatsapp-loop-breaker.ts`, `whatsapp-echo-guard.ts` |
| DB schema (Drizzle/Postgres) | Existing | `packages/shared/src/db/schema.ts` |
| Tenant boundary tracking | Existing (partial) | `packages/shared/src/tenancy.ts` |
| Dashboard API route pattern | Existing | `apps/dashboard/src/app/api/` |
| Lead intake normalization | New (no-code) | Make / n8n / Zapier scenario |
| T1 Intake endpoint | New code | `apps/dashboard/src/app/api/leads/intake/route.ts` (to create) |
| T2 Qualification engine | New code | `apps/bot/src/` + `packages/shared/src/` |
| T3 Hand-off + notify | New code | `apps/bot/src/router.ts` extension |
| T4 Follow-up cadence | New code | Extends `scheduler.ts` + reminders |
| T5 Weekly report | New code | `apps/dashboard/src/` |
| T6 Operator console | New code | `apps/dashboard/src/` |

---

## 2. Lead Intake — No-Code Recipes

### Canonical lead payload (JSON schema)

Every no-code integration, regardless of source, normalizes to this payload before POSTing to the T1 intake endpoint. This is the contract between the no-code layer and the bot.

```json
{
  "agency_id": "string (required) — operator-assigned slug, e.g. 'sunset-realty'",
  "source": "string (required) — one of: 'portal_email' | 'facebook_lead_ads' | 'web_form' | 'manual'",
  "lead": {
    "first_name": "string (required)",
    "last_name": "string (optional)",
    "phone": "string (required) — E.164 format, e.g. +61412345678",
    "email": "string (optional)",
    "message": "string (optional) — original lead message or inquiry text",
    "property_of_interest": "string (optional) — address or suburb/area",
    "inquiry_type": "string (optional) — 'buy' | 'sell' | 'rent' | 'unknown'"
  },
  "consent": {
    "given": true,
    "method": "string — e.g. 'form_checkbox' | 'inbound_form' | 'fb_lead_ad_policy'",
    "timestamp_utc": "ISO 8601 string — when consent was given"
  },
  "metadata": {
    "source_lead_id": "string (optional) — ID from originating system",
    "received_at_utc": "ISO 8601 string — when the lead arrived at the source",
    "campaign": "string (optional) — ad campaign or portal name"
  }
}
```

**Field rules:**
- `agency_id` and `lead.phone` are required; missing either returns HTTP 400.
- `phone` must be E.164 (international format). The no-code scenario must normalize it before sending.
- `consent.given` must be `true` for any outbound message to be sent. If `false` or missing, the lead is stored but no message is sent and the record is flagged `consent_missing` — this is a hard compliance gate.
- The T1 endpoint will hash `phone` before storage (matching the existing `hashPhone` pattern in `packages/shared/src/utils/crypto.ts`).

---

### Recipe A: Portal lead email (Zillow / Realtor.com / REA / Domain)

Most portals send a notification email to the agency's nominated address when a new lead submits an inquiry.

**Trigger:** New email in a dedicated inbox (e.g. `leads@agency.com`) — use Gmail or IMAP trigger in Make/n8n.

**Steps in the no-code scenario:**

1. **Trigger:** "Watch emails" module — filter by subject containing "New Lead" or "Inquiry" (exact subject varies by portal; configure per agency during onboarding).
2. **Parse email body:** Use a regex/text-parser module to extract:
   - `first_name`, `last_name` — usually in the "From:" field or opening line of the email body
   - `phone` — match pattern `+?[\d\s\-().]{7,15}` in the body; normalize to E.164
   - `email` — the lead's email (distinct from the agency's inbox)
   - `property_of_interest` — look for "Property:", "Address:", or "suburb" in the email body
   - `message` — the lead's free-text message field
3. **Normalize:** Map extracted fields into the canonical JSON schema above. Set `source: "portal_email"`, set `consent.method: "inbound_form"` (portal leads have submitted a form with consent language — confirm this per portal before launch).
4. **POST** to `POST https://[dashboard-domain]/api/leads/intake` with header `X-Agency-Secret: [HMAC_KEY]`.
5. **Error path:** If HTTP response is not 200, send an operator alert (email or Slack message) and do not retry more than 2 times within 10 minutes.

**Key risk:** Email parsing is fragile — portal email formats change. Build one parser per portal and test it with at least 5 real sample emails before going live. Do not use AI to parse the email in the no-code layer; use deterministic regex so behavior is predictable and auditable.

---

### Recipe B: Facebook Lead Ads

Facebook Lead Ads collect name, phone, and email from the user inside the Facebook/Instagram app, with consent captured by Meta's lead ad policy.

**Trigger:** Facebook Lead Ads native connector in Make/n8n/Zapier — "New Lead" trigger on the agency's Facebook Page and Ad Account.

**Steps:**

1. **Trigger:** "Watch leads" — connects to the agency's Facebook Ad Account via OAuth. Fires on each new form submission.
2. **Field extraction:** Facebook returns a structured JSON object; the field names vary by the form the agency built. During onboarding, map the agency's specific field names to canonical fields:
   - `first_name` ← `full_name` (split on space) or dedicated field
   - `phone_number` ← normalize to E.164
   - `email` ← `email`
   - `property_of_interest` ← any custom field such as "suburb" or "area of interest"
   - `inquiry_type` ← custom question if present, else "unknown"
3. **Consent:** Facebook Lead Ads require users to agree to the advertiser's privacy policy during submission. Set `consent.method: "fb_lead_ad_policy"` and `consent.given: true` — but verify with a lawyer for the jurisdiction that this satisfies TCPA / local equivalent for SMS messaging specifically. This is `UNVERIFIED` as a blanket legal claim.
4. **Normalize and POST** to T1 intake endpoint as above.

**Key risk:** Facebook API token expiry (60-day user tokens, page tokens can be longer). Build a token-expiry alert into the scenario.

---

### Recipe C: Generic web form / webhook

Agency has a contact form on their website (e.g. Squarespace, WordPress Gravity Forms, Webflow) or another system that can fire a webhook.

**Option C1 — Inbound webhook (simplest):** Configure the web form to POST to a Make/n8n inbound webhook URL. The scenario receives the raw form body, maps fields to the canonical schema, and re-POSTs to T1.

**Option C2 — Zapier catch hook:** Same pattern — the web form posts to a Zapier Catch Hook, fields are mapped, canonical payload is sent to T1.

**Steps:**

1. **Trigger:** "Custom webhook" / "Catch Hook" in Make/n8n/Zapier. Provide the hook URL to the agency to paste into their form's webhook settings.
2. **Field mapping:** During onboarding, the operator maps the agency's form field names to canonical fields. Document this mapping in the agency config (see §7).
3. **Phone normalization:** Web forms rarely enforce E.164. The no-code scenario must normalize: strip non-digits, prepend country code based on agency's country setting, prepend "+".
4. **Consent:** The web form must include a checkbox such as "I agree to be contacted by text/SMS by [Agency Name]." The `consent.given` field should only be set to `true` if that checkbox was checked. If not present on the form, flag the lead as `consent_missing` and do not send any outbound message — inform the operator to update the form.
5. **POST** to T1 endpoint as above.

---

## 3. Intake → Bot Handoff

### How the existing engine works (grounded in real files)

The bot entry point is `apps/bot/src/index.ts`. On startup it instantiates `WwebjsClient` (wrapping whatsapp-web.js), layers `WhatsAppLoopBreaker` and `WhatsAppSendMonitor` on top, builds `AgentDeps`, and creates a `Router` instance. The router's `handle` method is registered as the inbound message handler:

```typescript
// apps/bot/src/index.ts line 133
monitoredWhatsapp.onMessage(async (m) => router.handle(m));
```

The `Router` class (in `apps/bot/src/router.ts`) receives every inbound `InboundMessage` (typed in `packages/shared/src/whatsapp/client.ts`) and routes it through intent detection, shortcut parsing, and finally to the agent loop or direct handlers.

The `WhatsAppClient` interface (at `packages/shared/src/whatsapp/client.ts`) defines the send contract:
```typescript
send(msg: OutboundMessage): Promise<{ id: string }>
```

The scheduler (`apps/bot/src/scheduler.ts`) fires due reminders every minute using `node-cron` by calling `fireDueReminders` from `packages/shared/src/features/03-reminders.ts`. That function queries the DB for due reminders and calls `whatsapp.send()` for each.

### Where T1 plugs in

The T1 intake endpoint is a new Next.js API route in `apps/dashboard` — following the existing pattern at `apps/dashboard/src/app/api/operator/jobs/route.ts`. The pattern for a mutating API route in this repo is:

1. Check `requireSameOrigin` or, for external calls, validate a pre-shared HMAC secret in the `X-Agency-Secret` header.
2. Apply rate limiting (following `checkDashboardRateLimit` pattern).
3. Parse and validate the body.
4. Write to Postgres via Drizzle.
5. Return JSON.

For T1 specifically, after writing the lead record, the endpoint needs to trigger the first outbound WhatsApp/SMS message. Because the bot runs as a separate always-on Node process (Railway) and the dashboard runs on Vercel (serverless), the handoff cannot be a direct function call. The integration point options are:

- **Option A (recommended for MVP):** T1 endpoint writes the lead record with `status: "pending_first_touch"`. The scheduler process (in `apps/bot/src/scheduler.ts`) is extended to poll for leads in this status every minute, send the first message via the existing `whatsapp.send()` path, and update status to `"first_touch_sent"`. This reuses the exact same cron/polling pattern already used for reminders.
- **Option B:** T1 endpoint writes the lead and also queues a command job in the existing `commandJobs` table (which the bot already polls). The job carries the instruction to send the first message. This reuses the `createCommandJob` pattern from `packages/shared/src/ops/command-jobs.ts`.

Option A is simpler and more consistent with the existing architecture. Option B provides better audit-trail visibility via the existing command job lifecycle.

### Auth, rate-limit, and dedupe needs (T1)

- **Auth:** A per-agency pre-shared HMAC secret, stored as an env var or in the agency config table, validated in the request header. Do not accept unauthenticated POSTs from the internet.
- **Rate limit:** Apply the existing `checkDashboardRateLimit` pattern; start at 60 leads/minute per agency (far above realistic real-estate lead rates). Hard-cap total inbound at the operator level.
- **Dedupe:** Before writing, check whether a lead with the same `(agency_id, hashed_phone)` has been received in the last 24 hours. If so, return HTTP 200 (idempotent) but do not create a second record or send a second first-touch. This matches the `dedupeKey` pattern already on `commandJobs` (see `packages/shared/src/db/schema.ts` line 289).
- **PII:** Phone numbers are hashed before storage using the existing `hashPhone` from `packages/shared/src/utils/crypto.ts`. Raw phone is needed temporarily to send the message, then discarded from memory. The `re_lead_messages` table stores only message direction, timestamp, and touch number — not the full phone number.

---

## 4. Qualification + Branching

### State machine design

The qualification engine (T2) implements a config-driven multi-turn conversation state machine. The config is stored per agency (in the `re_agency_config` table or a JSON file loaded at startup) — not hardcoded — so any agency's script can be updated without a code deploy.

**State nodes (per the qualification script in `docs/realestate-offer-and-scripts.md` §2):**

```
States:
  INITIAL             — lead created, first-touch sent
  AWAITING_INTENT     — Q1 sent (buy / sell / both?)
  AWAITING_TIMELINE   — Q2 sent (this month / 1-3 months / exploring?)
  AWAITING_AREA       — Q3 sent (area / property?)
  AWAITING_BUDGET     — Q4 sent (price range?)
  AWAITING_FINANCING  — Q5 sent (cash / pre-approved / sorting?) [buyer only]
  QUALIFIED           — timeline ≤ 3 months, contactable
  NURTURE             — exploring or >3 months
  SUPPRESSED          — opt-out / wrong number / STOP received
  HANDED_OFF          — booking link sent, agent notified (terminal)
  CADENCE_ACTIVE      — in the 7-touch follow-up sequence
  CADENCE_COMPLETE    — all 7 touches exhausted with no reply (terminal)

Transitions:
  INITIAL → AWAITING_INTENT         (first-touch sent)
  AWAITING_INTENT → AWAITING_TIMELINE  (reply received)
  AWAITING_TIMELINE → branch:
    → AWAITING_AREA                 (always, to gather detail)
  AWAITING_AREA → AWAITING_BUDGET
  AWAITING_BUDGET → AWAITING_FINANCING (if intent=buy)
                 → QUALIFIED_CHECK   (if intent=sell)
  AWAITING_FINANCING → QUALIFIED_CHECK
  QUALIFIED_CHECK → QUALIFIED        (timeline "this month" or "1-3 months")
                 → NURTURE           (timeline "just exploring" or >3 months)
  any state + STOP/UNSUBSCRIBE/opt-out → SUPPRESSED
  QUALIFIED → HANDED_OFF             (after booking link sent + agent notified)
  NURTURE → CADENCE_ACTIVE           (after T4 scheduled)
  CADENCE_ACTIVE → AWAITING_INTENT   (if lead replies at any point → re-qualify)
  CADENCE_ACTIVE → CADENCE_COMPLETE  (all 7 touches sent, no reply)
```

### Config structure per agency

```json
{
  "agency_id": "sunset-realty",
  "agency_name": "Sunset Realty",
  "agent_name": "Sarah",
  "agent_phone": "+61400000000",
  "booking_link": "https://cal.com/sarah-sunset",
  "timezone": "Australia/Sydney",
  "quiet_hours_start": "21:00",
  "quiet_hours_end": "08:00",
  "script": {
    "opener": "Hi {first_name}, thanks for reaching out about {property_or_area}! ...",
    "q1_intent": "Are you looking to buy, sell, or both right now?",
    "q2_timeline": "Roughly when are you hoping to make a move ...",
    "q3_area": "Which area or neighbourhoods are you focused on?",
    "q4_budget": "Do you have a price range in mind? Totally fine if it's rough.",
    "q5_financing": "Are you paying cash, already pre-approved, or still sorting financing?",
    "qualified_reply": "Perfect — you're exactly who {agent_name} loves to help. Here's their calendar: {booking_link}. ...",
    "nurture_reply": "Got it — no rush at all. I'll check in now and then. ...",
    "optout_reply": "No problem at all — I'll take you off the list. Reply STOP anytime."
  },
  "cadence": [
    { "day": 1, "message": "Hi {first_name}, still keen to look around {area}? ..." },
    { "day": 3, "message": "A couple of {area} listings just came up ..." },
    { "day": 5, "message": "Quick one — are you still actively looking ...?" },
    { "day": 8, "message": "No pressure at all. If it helps, I can have {agent_name} send a quick guide ..." },
    { "day": 11, "message": "Still here whenever you need us, {first_name} ..." },
    { "day": 14, "message": "I'll pause here so I'm not a pest. Whenever you're ready ..." }
  ],
  "safety_gate": {
    "never_quote_price": true,
    "never_claim_availability": true,
    "never_make_legal_financial_advice": true,
    "if_upset_or_off_script": "hand_to_human"
  },
  "monthly_lead_cap": 500,
  "monthly_message_cap": 3000
}
```

The bot reads this config on startup (or reloads it when a signal is received). Scripts are templates, not prompts to an open-ended LLM — the LLM fills only the bracketed personalization fields. This is the "safety gate" approach from the offer doc: the AI personalises, the human approves the templates.

### Guardrails integration

The existing `checkMessageBeforeSending` from `packages/shared/src/features` (imported in `apps/bot/src/router.ts` line 21) provides the pre-send safety check pattern. T2 must invoke an equivalent check before any outbound lead message: if the draft contains price, commission, property availability claims, or legal/financial language, block the send and flag the lead for operator review.

---

## 5. Follow-Up Cadence — No-Code + Engine

### Scheduling via the existing reminders engine

The 7-touch / 14-day cadence reuses the reminder scheduler already in `apps/bot/src/scheduler.ts`. The scheduler fires every minute, calls `fireDueReminders` from `packages/shared/src/features/03-reminders.ts`, which queries the `reminders` table for due rows and sends via `whatsapp.send()`.

For T4, when a lead enters `NURTURE` status, the engine creates a series of reminder rows — one per cadence touch — in the `reminders` table (or in a new `re_lead_reminders` table that mirrors the pattern, with `agency_id` and `lead_id` foreign keys for tenant isolation).

Each cadence reminder row stores:
- `lead_id` — reference to the `re_leads` record
- `agency_id` — for tenant isolation
- `touch_number` — 1 through 7
- `fire_at` — absolute UTC timestamp (today + day offset from config, adjusted for quiet hours)
- `status` — `pending | fired | cancelled`
- `message_template` — the touch message from the agency config

### Opt-out, quiet hours, reply-stops-cadence enforcement

- **STOP / opt-out:** Any inbound message matching "STOP", "UNSUBSCRIBE", "QUIT", "CANCEL", "END", or "OPT OUT" (case-insensitive) in the router's inbound handler immediately:
  1. Updates the lead's status to `SUPPRESSED` in `re_leads`.
  2. Cancels all pending cadence reminder rows for that lead (sets `status: "cancelled"`).
  3. Sends the one-time opt-out confirmation reply.
  4. Sets a permanent suppress flag (`suppressed_at` timestamp) — the system will never send to that phone+agency combination again.
- **Quiet hours:** Before any cadence send, the scheduler checks `isInQuietHours` (already imported in `apps/bot/src/scheduler.ts` line 7 from `@nitsyclaw/shared/utils`). If the fire time falls in quiet hours, the message is deferred — the reminder `fire_at` is bumped to the next allowed send window. This is the same pattern used for the existing morning brief check.
- **Reply stops cadence:** If any inbound message arrives from the lead's number while a cadence is active, the router detects the `CADENCE_ACTIVE` state for that lead and phone, transitions to `AWAITING_INTENT` (re-qualification), and cancels remaining cadence touches. This is critical: a lead who replies is being re-engaged, not drowned in scheduled messages.
- **Loop guard:** The existing `WhatsAppLoopBreaker` (`apps/bot/src/whatsapp-loop-breaker.ts`) already prevents burst sends. Cadence sends must be throttled through the same monitored send path (`WhatsAppSendMonitor` at `apps/bot/src/whatsapp-send-monitor.ts`).
- **One-per-day rule:** The scheduler must check that no more than one cadence touch per lead has been sent in any 24-hour window before sending the next. This prevents accidental bursting if cron catches up after downtime.

---

## 6. Outcome Store + Weekly Report

### Minimal data model (new tables, same Postgres/Drizzle stack)

The existing schema is at `packages/shared/src/db/schema.ts`. The following new tables are needed for T1–T5. They follow the existing Drizzle/pgTable pattern exactly.

**`re_agency_config`** — one row per agency

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `agency_id` | text UNIQUE | operator-assigned slug |
| `config` | jsonb | full agency config JSON (schema in §4) |
| `active` | boolean | soft-disable without deleting |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**`re_leads`** — one row per unique lead per agency

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `agency_id` | text NOT NULL | foreign key to `re_agency_config.agency_id` |
| `phone_hash` | text NOT NULL | `hashPhone(phone)` — PII protection |
| `first_name` | text | |
| `source` | text | `portal_email | facebook_lead_ads | web_form | manual` |
| `status` | text | `pending_first_touch | awaiting_q1 | ... | qualified | nurture | handed_off | suppressed | cadence_active | cadence_complete` |
| `consent_given` | boolean NOT NULL | must be true for any send |
| `consent_method` | text | |
| `consent_at` | timestamptz | |
| `suppressed_at` | timestamptz | null if not suppressed |
| `qualified_at` | timestamptz | |
| `handed_off_at` | timestamptz | |
| `first_touch_sent_at` | timestamptz | for SLA measurement |
| `first_reply_at` | timestamptz | when lead first replied |
| `property_of_interest` | text | |
| `inquiry_type` | text | |
| `source_lead_id` | text | external ID for dedupe |
| `metadata` | jsonb | other collected fields |
| `created_at` | timestamptz | when the lead arrived |

Index: `(agency_id, status, created_at)` for report queries. Index: `(agency_id, phone_hash)` for dedupe.

**`re_lead_messages`** — one row per message sent or received per lead

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `agency_id` | text NOT NULL | tenant isolation |
| `lead_id` | uuid NOT NULL | FK to `re_leads.id` |
| `direction` | text | `in | out` |
| `touch_number` | integer | null for inbound; 1–7 for cadence outbound |
| `state_before` | text | lead state when message was sent |
| `state_after` | text | lead state after processing |
| `sent_at` | timestamptz | |
| `created_at` | timestamptz | |

Note: Message body is NOT stored in this table — only metadata. PII minimization: body text is not needed for reporting and should not be retained beyond operational necessity.

### Tenant isolation

The existing `tenancy.ts` (`packages/shared/src/tenancy.ts`) documents that several existing tables (`memories`, `reminders`, `expenses`, `briefs`, `confirmations`) are NOT yet tenant-scoped (marked `"single_owner_only"` / `publicSaleRisk: "blocked"`). The new `re_*` tables MUST have `agency_id` on every row and every query must include `WHERE agency_id = ?`. Do not share a DB connection pool without this filter. This is a P0 requirement.

The tenant isolation pattern to follow is the `owner_hash`-scoped tables (`profile_context`, `connected_accounts`, `command_jobs`) already verified as `publicSaleRisk: "ok"` in `tenancy.ts`.

### Weekly report (T5)

**What it contains (per agency, per week):**
- Total leads received
- Leads contacted (first touch sent)
- Leads replied (at least one inbound)
- Leads qualified
- Appointments booked (handed_off_at set)
- Leads in cadence
- Leads opted out / suppressed
- Median first-response time (minutes from `created_at` to `first_touch_sent_at`)
- Dead leads (cadence complete, no reply)

**Generation:** A scheduled job (new cron in `scheduler.ts` or a separate Monday morning cron) queries the `re_leads` and `re_lead_messages` tables, aggregates per agency, and:
1. Generates a plain-text or simple HTML summary.
2. Sends to the agency principal via email (using the operator's sending email provider) or posts to a shared Google Sheet (via Make/n8n webhook).

**Delivery:** For MVP, email is the simplest delivery path. The operator manually sends or sets up a Make scenario to receive a webhook from T5 and forward the report as an email.

**Tenant isolation test:** T5 must have a test that verifies no row from agency B appears in agency A's report. This is a DoD requirement for T5.

---

## 7. Per-Agency Onboarding Checklist

Goal: a new agency live in under one working day, zero code changes.

### Pre-onboarding (operator — one hour)

- [ ] Compliance gate (section 4 of `docs/realestate-offer-and-scripts.md`) confirmed for this agency's jurisdiction.
- [ ] SMS/WhatsApp provider account confirmed with A2P 10DLC registration (US) or equivalent. `UNVERIFIED` — confirm current registration requirements with provider.
- [ ] Dedicated sending number (long-code or toll-free) provisioned for the agency, or shared number strategy decided.
- [ ] Agency has signed the service agreement and data processing addendum.

### Step 1 — Create agency config (15 minutes)

1. Fill in the agency config JSON (schema in §4): `agency_id`, `agency_name`, `agent_name`, `agent_phone`, `booking_link`, `timezone`, `quiet_hours_start`, `quiet_hours_end`.
2. Customize the script templates with the agent's name and the area/property type they specialize in.
3. Set `monthly_lead_cap` and `monthly_message_cap` based on the agency's plan tier.
4. POST the config to the operator console (T6) or insert directly via the admin API.
5. Generate and store the HMAC secret for this agency (`agency_id:random_hex`). Record it securely.

### Step 2 — Connect the lead source (30–60 minutes depending on source)

**For portal email:**
1. Set up a dedicated forwarding address for the agency's portal leads (e.g. `agency-sunset@yourdomain.com`).
2. In the portal's account settings, add this address as a notification recipient.
3. In Make/n8n, configure the Gmail/IMAP "Watch emails" trigger on that address.
4. Configure the email parser module with the correct regex patterns for this portal's email format.
5. Set the HMAC secret in the scenario.
6. Test with a sample email (inject a test email matching the portal format and verify the lead appears in the outcome store).

**For Facebook Lead Ads:**
1. Connect the agency's Facebook Page and Ad Account to Make/n8n via OAuth.
2. Map the agency's lead form fields to canonical schema fields.
3. Set the HMAC secret.
4. Trigger a test lead via Facebook's Lead Ads Testing Tool and verify end-to-end.

**For web form / webhook:**
1. Create the inbound webhook in Make/n8n, copy the URL.
2. Give the URL to the agency to paste into their web form's webhook settings.
3. Confirm the form has a consent checkbox with appropriate language.
4. Map form field names to canonical schema.
5. Set the HMAC secret.
6. Submit a test form entry and verify the lead appears in the outcome store.

### Step 3 — Test the full flow (15–30 minutes)

1. Send a test lead via the connected source using a test phone number the operator controls.
2. Confirm the first-touch message arrives at the test phone within 2 minutes.
3. Reply to the qualification questions from the test phone.
4. Verify the lead transitions through qualification states correctly.
5. Confirm the booking link message and agent notification (T3) work on the qualified path.
6. Test the STOP opt-out: reply "STOP" and confirm no further messages are sent.
7. Check the outcome store (T6 operator console) shows the test lead with correct status.

### Step 4 — Go live (5 minutes)

1. Confirm test passed completely.
2. Set `active: true` in the agency config.
3. Notify the agency principal that the system is live and what to expect.
4. Log the go-live date and the agency's pilot end date.

### Step 5 — First week monitoring

- Check the T6 operator console daily for failures, SLA misses, and unusual opt-out rates.
- Confirm the first weekly report is generated correctly at end of week 1.
- Check for any carrier filtering (deliverability issues indicate A2P registration problems).

---

## 8. Provider and Cost Notes

### No-code platform comparison: Make vs n8n vs Zapier

| Factor | Make (formerly Integromat) | n8n | Zapier |
|---|---|---|---|
| **Cost model** | Operations-based billing; free tier exists | Free self-hosted; ~$20–50/mo cloud (`UNVERIFIED`) | Task-based; free tier limited; ~$20–100+/mo (`UNVERIFIED`) |
| **Self-host option** | No | Yes (Docker) | No |
| **Solo operator fit** | High — visual, generous free tier for low volume | High — self-host eliminates recurring platform cost at the price of infra ops | Moderate — highest name recognition, largest connector library, but most expensive at scale |
| **Connector library** | Large; Facebook Lead Ads, Gmail, webhooks all native | Large; community nodes available | Largest; most agency tools are there |
| **Error handling** | Good — scenario error routes, alerts | Good — but requires more configuration | Good |
| **Learning curve** | Low-medium | Medium (requires Docker comfort for self-host) | Low |

**Recommendation for a solo operator:** Start with **Make**. The visual scenario builder is fastest to configure per agency, the free/low-cost tier covers initial volume, Facebook Lead Ads and Gmail connectors are native, and error alerting is built in. Move to self-hosted n8n later if operating 15+ agencies and platform cost becomes material. Zapier is the fallback if an agency's existing stack is already Zapier-dependent (some portals offer Zapier-native integrations).

### SMS / WhatsApp sending provider

The existing bot uses WhatsApp via `whatsapp-web.js` (the `WwebjsClient` in `apps/bot/src/wwebjs-client.ts`), which is the personal WhatsApp client path (Path B in the codebase). This path is documented as volatile for business use (plan §9 of `docs/realestate-revenue-engine-plan.md`).

For the real estate service, **do not use the personal WhatsApp client path for outbound lead messaging.** Use a compliant business messaging provider instead:

- **Twilio** (`UNVERIFIED` pricing: ~$0.0075–0.015/SMS segment in the US; A2P 10DLC registration required): industry standard, robust webhook delivery, good logging, built-in opt-out handling. Most straightforward 10DLC registration path.
- **Telnyx** (`UNVERIFIED`): slightly cheaper per-message, similar feature set, also supports 10DLC.
- **WhatsApp Business API (via Meta or BSP):** Required for compliant business-initiated WhatsApp messages. Template messages must be pre-approved by Meta. Adds friction but is the only compliant WhatsApp business path. For MVP, start with SMS (Twilio/Telnyx) and add WhatsApp Business API later once the SMS path is stable and compliant.

**Decision required before launch:** Which country/state is the first pilot agency? This determines the exact regulatory path (TCPA + A2P 10DLC for US; ACMA + Spam Act for Australia; etc.). This decision also determines which provider to register with. Do not send a single automated message to a real lead without this decision made and registration complete.

### A2P 10DLC (US) — compliance gate

Per `docs/realestate-offer-and-scripts.md` §4:
- [ ] Brand registration with TCR (The Campaign Registry) via your SMS provider
- [ ] Campaign registration (use case: "Real Estate Lead Qualification and Follow-up")
- [ ] Consent language on every lead source form
- [ ] STOP / opt-out honoured immediately and permanently
- [ ] Quiet hours (8am–9pm local recipient time)
- [ ] Sender identification in the first message

This is a P0 launch blocker. `UNVERIFIED` — verify current requirements directly with the chosen SMS provider and TCR before starting registration.

### Cost model for a single pilot agency at 100 leads/month

Very rough estimate (`UNVERIFIED` — verify with live pricing before committing):

| Item | Estimated cost |
|---|---|
| Twilio SMS (~7 messages/lead × 100 leads) | ~$5–10/mo |
| Anthropic API (qualification LLM calls) | ~$5–15/mo depending on model and call count |
| Make scenario operations | ~$0 (free tier) to ~$10/mo |
| Vercel hosting (dashboard) | $0–20/mo depending on plan |
| Railway hosting (bot) | ~$5–10/mo |
| Postgres (Supabase or equivalent) | ~$0–25/mo |
| **Total estimated COGS per pilot agency** | **~$15–80/mo** |

At the $750/month Core retainer, gross margin is 89–98% at these volumes. The binding cost variable at scale is Anthropic API usage — enforce monthly message caps (already in the agency config schema) to prevent runaway costs.

---

## 9. Operator Addendum

### 1. Next best revenue move

Finalize the agency config JSON schema and the no-code Make scenario template for portal email leads. Then contact the first warm prospect and run the demo: have them text the demo number, watch it qualify them in real time. The spec is ready; the revenue unlock is showing a working demo to a real buyer. One phone number, one Make scenario, one agency config JSON — that is the minimum viable pilot.

### 2. Failure-prevention move

Complete the compliance gate before touching a real lead's phone number. Specifically: decide the first market (country/state), choose Twilio or Telnyx, start A2P 10DLC brand + campaign registration, and ensure every lead source has verifiable consent language. Sending automated messages without this risks fines and carrier bans that would make the business unlaunchable. The existing `WhatsAppLoopBreaker` and echo guard protect against technical loops but do not protect against regulatory non-compliance — that is a human decision that must be made first.

### 3. Recommendation

Do the compliance decision first — it is a one-session research task (pick market, pick provider, confirm 10DLC registration path, confirm consent language for the first lead source). That single session unblocks everything: the pilot price, the offer wording, the demo number, and the agency onboarding. Revenue and safety are not in tension here — they are sequenced. Safety unblocks revenue.

---

*Files read and grounded in this session: `docs/realestate-revenue-engine-plan.md`, `docs/realestate-offer-and-scripts.md`, `PROJECT_MAP.md`, `apps/bot/src/router.ts`, `apps/bot/src/index.ts`, `apps/bot/src/scheduler.ts`, `packages/shared/src/db/schema.ts`, `packages/shared/src/tenancy.ts`, `packages/shared/src/whatsapp/client.ts`, `packages/shared/src/features/03-reminders.ts`, `apps/dashboard/src/app/api/operator/jobs/route.ts`.*
