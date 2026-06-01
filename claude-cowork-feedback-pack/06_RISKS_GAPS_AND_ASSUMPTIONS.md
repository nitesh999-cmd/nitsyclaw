# Risks, Gaps, And Assumptions

## Product risks

- The product can overpromise as a "full PA" before external integrations are live.
- WhatsApp-first is compelling but fragile if WhatsApp Web, Meta policy, or session reliability changes.
- The dashboard has many owner/operator controls that can confuse normal users.
- The strongest current value may be narrower than the user's larger vision.

## Technical risks

- Public sale is blocked by tenant isolation.
- Customer-owned tables are not all tenant-scoped.
- Provider integrations are mostly setup-needed or adapter-needed.
- Railway WhatsApp runtime has historically needed recovery, loop guards, QR recovery, and deploy watchdogs.
- The bot router is large and high-risk to edit.

## Security risks

- Personal messages, reminders, expenses, briefs, confirmations, and audit logs are sensitive.
- WhatsApp actions can create wrong-recipient, spoofing, or loop risks.
- OAuth provider tokens must be encrypted, scoped, revocable, and never logged.
- Admin/debug/operator pages must remain protected and non-customer-facing.
- Public sale before tenant isolation could leak data across users.

## Privacy risks

- Messages, memories, expenses, receipts, documents, and audit logs can contain private data.
- Google Photos, Drive, mailbox, and bank-feed integrations are high-sensitivity and should not be connected broadly.
- Memory can become stale, incorrect, or over-retained.
- Export/delete flows need tenant-aware proof before customer sale.

## UX risks

- Too many commands/options can make the product feel like an internal tool.
- "Needs setup" can feel disappointing unless converted into a clear setup path.
- Long WhatsApp replies can be hard to read.
- Users may not understand what is local-only, draft-only, setup-needed, or blocked.

## Monetisation risks

- AppSumo users may expect unlimited AI usage and full integrations.
- AI/token costs can make lifetime pricing dangerous.
- Setup work may become high-touch and low-margin.
- The product may need concierge onboarding before self-serve billing.

## Distribution risks

- "AI PA" is crowded.
- WhatsApp AI assistants face policy and trust concerns.
- Users may compare it to ChatGPT, Gemini, Claude, Lindy, ORA, or automation platforms.
- Distribution is not proven in the repo.

## Missing validation

- No evidence of paying customers in code.
- No validated conversion funnel.
- No confirmed willingness to pay.
- No AppSumo campaign proof.
- No multi-user beta proof.
- No measured retention.

## Unsupported assumptions

- Users will pay for life-admin reminders/expenses/bills without Gmail/bank/calendar live.
- WhatsApp will remain a safe long-term primary channel.
- Normal users will accept setup-heavy provider flows.
- The product can support public customers without heavy support burden.

## Knockout risks

These should block public launch:

1. Tenant isolation incomplete.
2. Multi-user auth incomplete.
3. External provider actions not safely connected.
4. No usage/cost guard for public users.
5. Privacy/export/delete not proven tenant-safe.
6. WhatsApp reliability not proven at customer scale.
7. Product promise too broad for current implementation.

