# Codebase Health Check

## Code quality observations

Strengths:

- Strong TypeScript coverage across packages.
- Many targeted tests for bot, dashboard, tenancy, CI, release, provider readiness, and WhatsApp reply shape.
- Clear scripts for release gates, security scans, tenant checks, and production smoke.
- Provider readiness and public-sale blockers are explicit.

Concerns:

- `apps/bot/src/router.ts` is large and carries many responsibilities.
- Product docs and generated maps are numerous; some may be stale.
- Many features exist as tools or queues, but not as live connected integrations.
- Command surfaces can feel internal/operator-heavy.

## Architecture observations

Architecture is sensible for a private-owner validation build:

- Dashboard for control plane.
- Bot worker for WhatsApp.
- Shared package for DB, tools, features, tenancy.

Architecture is not yet safe for public sale:

- Tenant storage is incomplete.
- Multi-user auth is incomplete.
- Public customer onboarding, billing, support, export/delete, and provider consent are not complete.

## Dependency risks

- `whatsapp-web.js` creates operational/session risk.
- AI SDK/model usage needs cost controls.
- Google/Microsoft/Spotify dependencies are present but setup is incomplete.
- Dependency overrides exist in root `package.json`, which shows active vulnerability management.

## Security concerns

- Public sale blocked correctly because key tables are unscoped.
- Audit logs need careful redaction before customer-facing access.
- OAuth tokens require strict encryption, scopes, revocation, and no logging.
- Dashboard admin/operator/debug pages should remain owner-only.

## Error handling gaps

- Many tests and safe error routes exist.
- The risk is less "no error handling" and more "complex runtime with many branches".
- WhatsApp failures need continued production smoke and loop-guard monitoring.

## Test coverage observations

Strong evidence:

- Recent full CI passed.
- Root has many focused tests.
- WhatsApp release gate exists.
- Tenant and provider checks exist.
- Security checks include Semgrep, npm audit, and ZAP baseline in CI.

Gaps:

- More real-world fixture tests are needed for bills, receipts, scam messages, and messy speech.
- Commercial user onboarding tests are not enough because public sale is intentionally blocked.
- Provider integration live tests require real connected accounts.

## Build/deployment concerns

- Dashboard uses Vercel.
- Bot uses Railway.
- DB uses Supabase/Postgres.
- CI currently appears strong.
- Railway/WhatsApp runtime remains the key live reliability risk.

## Recommended cleanup actions

1. Keep public sale blocked until tenant migration is real and tested.
2. Create a smaller customer demo mode that hides owner/operator complexity.
3. Build a real-world WhatsApp prompt fixture pack for bills, receipts, expenses, scams, reminders, and voice transcripts.
4. Split the bot router into smaller handlers only after tests lock behavior.
5. Convert provider setup into one clear wizard instead of scattered status pages.
6. Add usage/cost guardrails before any paid beta or AppSumo offer.
7. Review data export/delete with tenant-aware tests before customer pilots.

