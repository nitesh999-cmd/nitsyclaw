# Codex Instructions

NitsyClaw is a WhatsApp-first personal PA with a private dashboard. The product must feel simple for normal people, not like an AI control panel.

Before changing code:
- Read `PROJECT_MAP.md`, then inspect the files directly involved in the request.
- Follow `AUDIT_STANDARD.md` for reliability, security, privacy, and release claims.
- Follow `UI_STANDARD.md` for dashboard/UI work.
- Check `git status -sb`; do not overwrite user changes.

Execution rules:
- Fix P0/P1 issues before polish.
- Keep changes small, reversible, and backed by tests.
- Do not clone random agent/skill repos into this project.
- Do not install new tools permanently unless the benefit clearly beats setup, security, maintenance, token, and cost burden.
- Prefer existing gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`, `pnpm run security:audit`, `pnpm run security:semgrep`.
- Use Lighthouse manually for UI/performance/SEO investigations only after confirming it is stable on the current machine.

Product rules:
- WhatsApp reliability is the core product surface.
- Dashboard is the trust/control surface: Today, Queue, Decisions, Memory, Integrations, Health.
- Never claim setup-heavy integrations are shipped unless OAuth/provider setup, tests, and real behaviour prove it.
- Risky actions stay approval-gated: messages, calls, emails, purchases, deletes, bookings, payments, external posts, deploys.
- Use plain human language: remember, remind, prepare, find, reply, private helper. Avoid user-facing AI jargon.

Final reports must include files changed, commands run, pass/fail results, unresolved risks, and whether deploy/push was intentionally skipped.
