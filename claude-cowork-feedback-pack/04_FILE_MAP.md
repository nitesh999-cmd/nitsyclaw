# Practical File Map

## Important folders

| Path | Purpose |
|---|---|
| `apps/dashboard` | Next.js dashboard, pages, API routes, auth, customer control plane. |
| `apps/bot` | WhatsApp worker, router, runtime guards, QR recovery, bot health, notifications. |
| `packages/shared` | Shared database, agent loop, tools, feature modules, integrations, tenancy. |
| `packages/shared/drizzle` | Drizzle migrations. |
| `scripts` | Release, Railway, security, tenant, provider, operator, and smoke scripts. |
| `docs` | Architecture, testing, launch, tenant, revenue, WhatsApp reliability, runbooks. |
| `.github/workflows` | CI pipeline. |
| `ideas` | Product backlog/idea material. |
| `claude-cowork-feedback-pack` | This external review pack. |

## Important files

| File | Why it matters |
|---|---|
| `package.json` | Root scripts, CI/release commands, dependency overrides. |
| `README.md` | Quick start and deployment overview. |
| `.env.local.example` | Environment contract and provider setup signals. |
| `packages/shared/src/db/schema.ts` | Main database schema. |
| `packages/shared/src/tenancy.ts` | Public-sale tenant boundary rules. |
| `packages/shared/src/customer-instance.ts` | Private-owner/customer readiness checks. |
| `packages/shared/src/agent/system-prompt.ts` | Assistant safety and behavior rules. |
| `packages/shared/src/agent/loop.ts` | Tool loop execution. |
| `packages/shared/src/features/index.ts` | Registers all assistant tools. |
| `packages/shared/src/integrations/provider-readiness.ts` | Truth source for provider readiness. |
| `apps/bot/src/router.ts` | Main WhatsApp routing and command handling. |
| `apps/bot/src/personal-command-shortcuts.ts` | Deterministic WhatsApp shortcuts and safety catches. |
| `apps/bot/src/whatsapp-loop-breaker.ts` | Prevents reply loops/send bursts. |
| `apps/bot/src/whatsapp-runtime-guard.ts` | Runtime health guard. |
| `apps/dashboard/src/app/dashboard-shell.tsx` | Dashboard navigation and owner/customer surface split. |
| `apps/dashboard/src/app/page.tsx` | Today/home dashboard. |
| `apps/dashboard/src/app/onboarding/page.tsx` | Controlled validation onboarding. |
| `apps/dashboard/src/app/offer/page.tsx` | Public-facing offer page draft. |
| `.github/workflows/ci.yml` | Release confidence and production smoke. |
| `docs/revenue-appsumo-plan.md` | Current business and revenue hypothesis. |
| `docs/tenant-boundary-migration-plan.md` | Plan for public-sale data separation. |
| `docs/whatsapp-recovery-runbook.md` | WhatsApp recovery operations. |

## Files that seem unused or risky

Not verified as unused, but review-worthy:

- Root-level older audit reports and logs may be stale.
- `PROJECT_MAP.md` is generated and very large; useful for indexing, not product truth.
- `mind.md` is large living context; useful but may contain outdated ambition.
- `logs`, `coverage`, `artifacts`, `output`, `test-results`, `playwright-report` are generated/runtime folders and should not be used as product claims.

## Files that seem duplicated or overlapping

- Multiple docs cover launch/readiness/security/WhatsApp reliability. They are useful but may contain repeated or stale claims.
- Provider readiness exists in both dashboard and WhatsApp surfaces; `packages/shared/src/integrations/provider-readiness.ts` should remain the source of truth.
- Many root-level tests mirror app/package tests; this is good for gates but makes codebase navigation heavy.

## Files risky to edit

- `packages/shared/src/db/schema.ts`
- `packages/shared/src/tenancy.ts`
- `packages/shared/src/db/repo.ts`
- `apps/bot/src/router.ts`
- `apps/bot/src/whatsapp-loop-breaker.ts`
- `apps/bot/src/wwebjs-client.ts`
- `.github/workflows/ci.yml`
- `railway.json`
- `Dockerfile`
- Auth routes under `apps/dashboard/src/app/api/auth`
- Migration files under `packages/shared/drizzle`

## Files Claude Cowork should pay attention to

1. `docs/revenue-appsumo-plan.md`
2. `docs/architecture.md`
3. `docs/pa-v1-launch-checklist.md`
4. `packages/shared/src/tenancy.ts`
5. `packages/shared/src/integrations/provider-readiness.ts`
6. `apps/bot/src/router.ts`
7. `apps/bot/src/personal-command-shortcuts.ts`
8. `apps/dashboard/src/app/page.tsx`
9. `apps/dashboard/src/app/offer/page.tsx`
10. `apps/dashboard/src/app/onboarding/page.tsx`

