# Release closeout — voice into the audit chain

**Status: Step 5 PASSED. Voice GO.**
Record written 2026-08-19 15:02 AEST. Uncommitted by instruction.

Each fact below is marked VERIFIED (measured in this session, with command output retained)
or CARRIED (established earlier in the operation, not re-measured today).

## What shipped

| | |
|---|---|
| PR | #20, `integrate/voice-into-audit` |
| Merge commit | `e0d948727064a3ec13cbc5974673c6e8c3b105c1` (`e0d9487`), two-parent merge (CARRIED) |
| Fix-forward | `6a06e1496e31fc5883ebf7cbb932b89f9dc5c120` (`6a06e14`), fast-forward from `e0d9487`, no force (VERIFIED) |
| Fix-forward contents | `pnpm-workspace.yaml` gains `onlyBuiltDependencies: [puppeteer]`; three defects fixed in `docs/runbooks/laptop-cutover.md`. Two files. `pnpm-lock.yaml` unchanged (VERIFIED) |

### Why the fix-forward was needed

`e0d9487` overrides puppeteer to 25.5.0, which requires Chrome 151.0.7922.71. pnpm 10
blocks dependency build scripts by default, so puppeteer's postinstall — the step that
downloads that build — was skipped while `pnpm install` still exited 0. The laptop then had
no browser, and the failure surfaced only at session-restore time. The first cutover attempt
hit exactly this and rolled back. `onlyBuiltDependencies: [puppeteer]` makes the browser
arrive with the install: `pnpm install --frozen-lockfile` now runs `puppeteer postinstall`
and fetches chrome 151 (VERIFIED).

## Database

- Migrations `0009`–`0012` applied and journaled; journal = 13 rows; four voice tables
  present; `owner_hash` columns = 15; zero duplicate journal rows (CARRIED).
- `0011`/`0012` are additive, so `e131b52` runs unchanged against the migrated schema —
  which is why the laptop rollback needed no database rollback (CARRIED).
- Recovery reference: encrypted dump `6d4f9607…` (CARRIED — recorded as supplied; the full
  digest was not re-verified in this session).

## Railway

| | |
|---|---|
| Active deployment | `49db8086-39c4-4aaa-9e10-c2319d75a7f9` (VERIFIED) |
| Status / commit / branch | SUCCESS / `6a06e149…` / `main` (VERIFIED) |
| Created | 2026-08-19T02:47:42Z (VERIFIED) |
| Mode | no-client — `whatsapp.ready=false`, `reason=runtime_not_owner` (VERIFIED) |
| `/healthz` | 200 (VERIFIED) |
| `/recovery/whatsapp-qr` | 404 (VERIFIED) |

Railway does not hold the WhatsApp session. `NITSYCLAW_WHATSAPP_RUNTIME_OWNER=laptop` is set
on the service, which is what retired the older permissive build.

## Laptop cutover

| | |
|---|---|
| Date | 2026-08-19 |
| Bot stopped | 13:08:06 AEST |
| CONNECTED proven | 13:12:42 AEST |
| Downtime | **4m36s** (deadline 13:38:06 — 25 min spare) |
| QR presented | **No.** Session reused; nothing scanned |
| Session directory | `~/.nitsyclaw/secrets/.wa-session` — 3693 files before, intact throughout; never deleted, moved or edited |
| Running commit | `commitShort=6a06e14` reported by the live bot (VERIFIED) |
| Instances | exactly 1, PID unchanged since launch (VERIFIED) |
| Broom | `Ready`, `LastTaskResult=0`, fires on schedule without double-spawning (VERIFIED) |

A QR alarm fired during the run at 13:11:27. It was a **false positive in the check**, not a
real QR: `/recovery/whatsapp-qr` returns 200 on the laptop because it serves the recovery
form shell, and the response contained zero `data:image` payloads and no QR element. Nothing
was scanned.

## Gates

### Step 5 — 7 scripts, all green (VERIFIED)

Each was re-confirmed from source at `6a06e14` before running, as: no WhatsApp send, no
pairing/QR, no production DB write, no provider mutation.

| Script | Exit | Evidence |
|---|---|---|
| `voice:verify-v2-freeze` | 0 | aggregate `d169f858…` |
| `voice:verify-v2.1-freeze` | 0 | recorded-exception block verified |
| `voice:verify-qwen3-asr-freeze` | 0 | aggregate `df1b7680…` |
| `voice:verify-verifier-v1.3-freeze` | 0 | complete aggregate `a7846e8e…` |
| `voice:test` | 0 | 10 files, 281 tests |
| `whatsapp:smoke` | 0 | 11 files, 329 tests |
| `ci:provider-readiness` | 0 | 7 files, 25 tests |

The live bot stayed `CONNECTED` between every suite; the PID never changed.

### Gate 8 — manual equivalent, substituted (VERIFIED 2026-08-19 15:02 AEST)

`railway:whatsapp-ready` exited 1 and **cannot pass as written**. It was replaced for this
release by the manual equivalent below, all of which held:

- Railway deployment `49db8086`, commit `6a06e14`, SUCCESS
- `/healthz` 200; `/health` → `status=ok`, `ready=false`, `reason=runtime_not_owner`;
  `/recovery/whatsapp-qr` 404
- Laptop `/health` → `ready=true`, `CONNECTED`, `commit=6a06e14`; exactly 1 instance;
  Broom `Ready`

### CI at `6a06e14` (VERIFIED)

`test`, `windows`, `security`, `e2e`, `zap-baseline` — all success. `vercel-build` success.
`whatsapp-production-smoke` skipped, as at `e0d9487`.

### Vercel (VERIFIED)

Production deployment `dpl_221RSZhgHQVeEZDphzHnUviESbaP`, state success.
`nitsyclaw.vercel.app/` → 307 → `/login`; `/login` 200, titled
"NitsyClaw | Private Personal PA"; the served HTML carries the matching `dpl_` id,
confirming the canonical domain serves this build and not a stale alias.

### Never run

`whatsapp:prod-smoke`, `release:live-smoke`, `release:post-deploy-proof` — excluded by name;
located but not invoked under any framing. Deferred and not run: `voice:eval-local`,
`voice:eval-local-v2`, `voice:eval-qwen3-asr`, `voice:diagnose-qwen3-asr`.

## Open follow-ups

1. **`railway:whatsapp-ready` is broken two ways.** (a) It pipes
   `pnpm dlx @railway/cli status --json` — whose stdout begins with pnpm installer chatter
   (`Progress: …`) on a cold cache — straight into `ConvertFrom-Json`, which fails on the
   leading `P`. That makes the gate pass or fail on cache warmth. (b) Structurally, it
   asserts Railway logs contain `[wwebjs] client ready` and `[boot] WhatsApp ready`, which
   no-client mode never emits; it encodes the retired Railway-owns-WhatsApp model. Suggested
   repoint: assert the post-cutover invariant instead — `/healthz` 200,
   `reason=runtime_not_owner`, `/recovery/whatsapp-qr` 404 — and parse JSON from a clean
   invocation. Not modified in this step, by instruction.
2. **Railway auto-deploy is ON.** Connecting the environment to `main` armed it, despite a
   separate "Auto deploy is disabled" control that was never clicked. Every push to `main`
   now deploys production automatically. An earlier claim during this operation that it was
   off was wrong. Decide whether this is intended.
3. **`main` has no branch protection.** The five checks are convention, not enforced; a red
   push would not be blocked.
4. **Laptop is on `codex/whatsapp-voice-intelligence` @ `6a06e14`, not `main`.**
   `git checkout main` refused because `C:/w/voice-int` holds `main` as a linked worktree.
   HEAD is the correct commit, but that branch ref moved from `e131b52` to `6a06e14`, so
   rollback is now `git reset --hard e131b52`. Worth freeing the worktree and putting the
   laptop on `main` proper.
5. **`esbuild` build script still blocked** — deliberate; the allowlist was scoped to
   puppeteer only. `sharp` likewise.
6. **Six Playwright proof files** from `output/playwright/local-brain-browser-proof/` are
   preserved outside the repo in the session scratchpad, not deleted. Restore or discard as
   you prefer.
7. **`.env.local` backup** from the ownership edit is in the session scratchpad. Scratchpad
   contents are session-scoped — move items 6 and 7 somewhere durable before cleanup.
