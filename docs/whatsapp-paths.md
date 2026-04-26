# WhatsApp Paths — Cloud API vs. Personal/Unofficial

Detailed comparison of the two transports OpenClaw supports. Also see Constitution R2.

## Path A — WhatsApp Business Cloud API (official)

**Library:** Meta Graph API endpoints, hosted by Meta.
**Identity:** A registered Business phone number, separate from personal WhatsApp.

### Pros
- Official, ToS-compliant.
- Hosted by Meta — no servers to run for the WhatsApp side.
- Up to 500 messages/sec.
- Verified businesses can scale to 100K msg/day in 2026.

### Cons / 2026 constraints
- All **outbound** business-initiated messages must use **pre-approved templates**, reviewed within 24–48 hours.
- **24-hour customer service window** — outside it, you can only send template messages, not free-form.
- **AI chatbot rules tightened in 2026** — open-ended AI chats without a clear goal are no longer allowed. Bot must perform "concrete business tasks" (support, purchase advice, booking, etc.).
- **Marketing message templates paused for US numbers** since April 2025 (still in effect April 2026).
- **Pacing** — even with high tier limits, Meta releases sends in batches gated on quality signals.
- **Identity changes** — WhatsApp usernames may hide phone numbers; BSUID is the new identifier delivered via webhooks.
- Per-conversation pricing.

### Use this path when
- The deployment serves more than just Nitesh.
- It's a commercial / customer-facing build.
- ToS compliance is non-negotiable.

### Sources
- Meta WhatsApp Business Cloud API docs (2026)
- Sanuker — "WhatsApp 2026 Updates: Pacing, Limits & Usernames"
- Woztell — "WhatsApp API 2026 Updates"
- Chatarmin — "WhatsApp Cloud API: Setup & Cost Guide (2026)"

---

## Path B — Personal / Unofficial

**Library:** `whatsapp-web.js` (Node) or `Baileys` (Node) — drives WhatsApp Web via a headless browser or its WebSocket protocol.
**Identity:** Nitesh's own WhatsApp account.

### Pros
- Free.
- Free-form messaging anytime — no 24-hour window, no templates.
- Voice notes, images, attachments — all work as a normal user.
- No Meta Business verification, no template review.
- Best fit for "AI assistant only for me, talking to my own number."

### Cons
- **Unofficial.** Meta can ban the underlying account at any time.
- **Single-user.** Cannot be operated for any other person without violating Meta ToS.
- **Fragile.** Library breakage when WhatsApp Web changes.
- **No SLA, no support.**

### Hard rule (Constitution R2)
- This path is permitted **only** for single-recipient personal use, where Nitesh's own number is both sender and recipient.
- Mixing Path A and Path B in the same deployment is forbidden.
- Any plan to onboard a second user requires migrating to Path A first.

### Use this path when
- Building the just-for-me v1.
- Iterating quickly on prompts and UX without Meta template overhead.
- Voice-note and image flows where Cloud API templates are awkward.

---

## Decision matrix

| If… | Use |
|---|---|
| Just me, fastest path to value | **Path B** |
| Showing to a friend or rolling out to family | **Path A** |
| Anything commercial or customer-facing | **Path A** (no exceptions) |
| US-based marketing | **Path A** but check current US restrictions |
| Open-ended AI chat is core to UX | **Path B** (Path A blocks open-ended AI in 2026) |

## Migration plan A → B (forbidden) and B → A (supported)

There is no migration from A to B — Path A is always strictly more restricted. The supported migration is **B → A** when a deployment moves from personal to multi-user. Steps:

1. Register Meta Business + verify phone number (≈1 week).
2. Submit message templates for approval.
3. Build template-rendering layer in `src/whatsapp/`.
4. Switch the transport adapter; the agent loop stays unchanged.
5. Audit every outbound path — any free-form bot reply outside the 24hr window must become a template.
