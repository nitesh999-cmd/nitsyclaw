# 06 — P0 Shortlist (10 items for v1)

> The hard cap. New ideas default to P2; promotion to P0 requires an adversarial pre-mortem (R11).

These 10 things together = "OpenClaw works for me on day 1." Nothing else is P0 until at least 8 of these are shipped.

| # | Source idea | Why P0 |
|---|---|---|
| **1** | 1.2 — Text command natural language | Without this, nothing else is reachable. |
| **2** | 1.1 — Voice-note capture → transcribe → file | Voice is the primary capture mode for personal use. |
| **3** | 1.7 — "Remind me about X" with relative + recurring | Lowest-effort, highest-recurring-value reply. |
| **4** | 1.5 / 4.1 — Daily morning briefing at 7am | Triggers proactive value daily; sets expectation that OpenClaw isn't just reactive. |
| **5** | 1.17 — "What's on my plate today?" | The on-demand version of #4. |
| **6** | 1.13 — "Where did I save the thing about X?" | Memory is OpenClaw's moat; this proves it works. |
| **7** | 1.12 — "Schedule a call with X" | Calendar write — first action that touches the world for me. |
| **8** | 1.27 — Web research → 3-line summary | Hits the "agent that does work" promise. |
| **9** | 1.33 — Confirmation before destructive action | Safety rail. Required before turning on #7 or any send action. |
| **10** | 1.3 + 5.9 — Receipt photo → expense logged | Visual proof of "AI does the boring work." High demo value. |

## Plus the dashboard MUST-HAVES enabling the above

These don't count against the 10 but are required for the bot side to function:

- 2.1 — Today view
- 2.2 — Conversation log
- 2.3 — Memory editor
- 2.5 — Scheduled tasks list
- 2.6 — Integrations page (OAuth Gmail + Calendar + Notion)
- 2.9 — Notification times / quiet hours
- 2.10 — Confirmation rules
- 2.16 — Reminders calendar
- 2.19 — Backups + export
- 2.20 — Onboarding wizard
- 2.30 — Mobile-friendly PWA

## Plus these automations & integrations

- 4.1 Morning brief, 4.6 Calendar conflict watcher, 4.16 Backup runner, 4.19 Stale memory pruner
- 3.1 Gmail, 3.2 Calendar, 3.4 Notion

## Out of scope for v1

Everything else in `01-`, `02-`, `03-`, `04-`, `05-`. Including: family/shared, voice cloning, banking, health, knowledge graph, multi-agent, browser actions. These are P1/P2/P3 — promote with care.

## v1 success criteria

1. I can send WhatsApp a voice note "remind me to call mom tomorrow at 7" and it works.
2. I get a useful 7am brief that I read every day for 14 consecutive days.
3. I forward a receipt and it appears categorized in the dashboard within 10 seconds.
4. I can ask "where did I save the thing about <topic>?" and get the right answer ≥80% of the time.
5. The dashboard shows me everything OpenClaw did in the last 24 hours — no surprises.
