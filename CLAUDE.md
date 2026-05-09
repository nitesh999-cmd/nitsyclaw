# Claude Code Instructions

NitsyClaw is a WhatsApp-first personal PA with a private dashboard. Keep the product practical, private, and understandable for normal people.

Always start by reading:
- `PROJECT_MAP.md`
- `AUDIT_STANDARD.md`
- `UI_STANDARD.md` when touching UI

Claude Code subagent policy:
- Project subagents may live in `.claude/agents/`, but only add them after reviewing the exact agent text.
- Do not bulk-install community subagents.
- Do not add Claude-only agents for Codex workflows.
- Prefer a few read-only reviewers for security, UI, performance, or ops over broad autonomous writers.
- Any subagent that can write files, run shell commands, deploy, send messages, or touch secrets must be explicitly justified and reviewed first.
- Current approved project agents are read-only reviewers in `.claude/agents/`; keep them aligned with `docs/tool-adoption.md`.

Execution rules:
- Fix P0/P1 before P2/P3.
- Keep changes targeted, reversible, and tested.
- Do not deploy, delete major systems, rewrite schemas, or add paid services without approval.
- Do not claim integrations are live until OAuth/provider setup and real tests prove it.
- Risky actions stay approval-gated.

Recommended gates:
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e`
- `pnpm run security:audit`
- `pnpm run security:semgrep`
- Manual Lighthouse checks for UI/performance/SEO work, only after confirming Chrome/Lighthouse is stable on the current machine

Final reports must include files changed, commands run, pass/fail results, unresolved risks, and whether deploy/push was intentionally skipped.
