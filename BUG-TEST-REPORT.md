# NitsyClaw Owner Alpha adversarial QA report

Date: 2026-07-19 (Australia/Sydney)
Scope: owner-only Local Brain launcher, local state, memory/correction/retrieval, scorecard, approval rail, shutdown, and exact local-data removal
Branch at test start: `feat/local-brain-prospect-demo-v2`
Baseline commit: `0aa417a`
Data boundary: synthetic disposable roots ending in exact `NitsyClaw/owner-alpha`; the real `%LOCALAPPDATA%\NitsyClaw\owner-alpha` folder was not enumerated, opened, copied, or modified.

## Verdict

`PASS WITH MINOR KNOWN LIMITATIONS` for a seven-day owner-only alpha. No P0 defect was found. All reproduced P1/P2 defects in the owner-alpha runtime were fixed with regression coverage. The repo-wide deep security gate remains red on pre-existing, out-of-scope findings, so this verdict must not be reused as a beta, AppSumo, deployment, or whole-repository security-readiness claim.

## Reproduced defects and disposition

| ID | Severity | Reproduction and observable failure | Fix | Regression evidence |
|---|---|---|---|---|
| OA-01 | P1 | Two state snapshots saved sequentially produced one final memory instead of two: a silent lost update. | Added an atomic process lock, live-PID rejection, stale-lock recovery, token-owned release, and clean release on EOF/removal. | Concurrent real launch: first session stayed healthy; second exited 1 with `already running`; restart preserved owner hash/memories. Unit lock test passes. |
| OA-02 | P1 | `forward`, `share with`, `WhatsApp`, `DM`, meeting scheduling, indirect receipt, and ticket/order requests classified as answer-only. | Expanded deterministic external/destructive classification. The owner alpha still has no action handler or approve-and-send path. | Eight indirect external phrases now classify approval-required; `Clear my saved memories` classifies destructive confirmation. Live workflow held two probes with `outbound executions: 0`. |
| OA-03 | P1 | Four ordinary-language stored-instruction probes passed both write and retrieval filters. | Expanded shared instruction-like detection for disguised system/developer impersonation, memory-as-policy, obey/execute, and private-data dump patterns. Existing untrusted wrappers remain. | All four probes reject; shared Local Brain and owner-alpha focused tests pass. |
| OA-04 | P1 | Token JSON and several cloud/provider credentials were reachable in the child environment despite the launcher safety claim. | Added missing provider/account keys plus dynamic credential-name stripping; direct script invocation also refuses unknown credential-like keys and capability variables such as `SSH_AUTH_SOCK`. Parent values are restored. | Health passed with synthetic credential sentinels in the parent and `restored=True`; direct environment tests refuse known and unknown keys. |
| OA-05 | P1 | An exact-looking `NitsyClaw/owner-alpha` junction could redirect storage writes away from the displayed folder. | Reject symlinks and Windows junctions at the parent/data boundary for reads, writes, and removal. | Junction probe rejected storage/removal and preserved the target sentinel. |
| OA-06 | P2 | The destructive phrase accepted leading/trailing whitespace because input was trimmed. | Compare raw input byte-for-byte. | Five live wrong forms (case, leading space, trailing space, blank, partial) removed nothing; the exact phrase removed nested/unexpected synthetic files. |
| OA-07 | P2 | A scorecard path collision made `saveOwnerAlphaState` throw after JSON memory had already persisted, creating a false all-or-nothing failure. | JSON remains the atomic source of truth; Markdown is an atomic derived view with an explicit warning/result. Health fails if the derived view cannot refresh. | Collision test reports `scorecardUpdated=false` while reload truthfully contains the memory. |
| OA-08 | P2 | Valid JSON with duplicate memory IDs, invalid dates, or non-string tags loaded successfully. | Added strict timestamps/dates, UUIDs, tag/source/kind checks, duplicate memory-ID and duplicate score-date rejection. | Malformed-state and invalid/oversized JSON tests fail closed. |
| OA-09 | P2 | Exact duplicate active memories were accepted, cluttering retrieval and making correction selection ambiguous. | Reject case-insensitive identical active memory and correction targets without changing existing data. | Duplicate regression and live duplicate attempt both reject; first memory remains active. |
| OA-10 | P2 | Closing stdin at a prompt could exit silently without the normal shutdown path or lock cleanup. | Abort pending questions on readline close and treat EOF/Ctrl+C closure as a normal session stop. | Real EOF run exited 0, printed clean shutdown, left no lock, and emitted no stderr. |
| OA-11 | P3 | `/HELP` was treated as unknown and score entry could not be cancelled after it began. | Commands are case-insensitive; blank or `/cancel` aborts the complete score flow before mutation. | Live `/HELP` worked; invalid rating was retried; blank cancelled with zero partial entry; the next complete score saved one row. |

## Adversarial workflow evidence

### Real launcher and real local models

The first isolated session executed 37 prompt/response steps through `owner-alpha.ps1` and the real loopback Ollama service:

- startup health passed all checks with exact `qwen3:8b` and `nomic-embed-text:latest`;
- case-insensitive help worked;
- whitespace-normalized manual memory saved only after `YES`;
- an identical memory and instruction-like memory were rejected;
- multilingual memory saved;
- invalid correction index retried; exact correction retired the old row;
- a normal question returned a non-empty real Qwen answer with the local-only footer;
- two indirect risky requests stayed approval-held, each with zero executions;
- invalid score input retried; blank cancelled without a row; a complete retry saved exactly one row;
- `/exit` released the session lock.

Observable summary: `code=0`, `37/37 steps`, `healthPassed=true`, `activeMemoryCount=2`, `retiredMemoryCount=1`, `scorecardEntries=1`, `approvalHolds=2`, `lockRemaining=false`, `stderrPresent=false`. The only files created were `state.json` and `scorecard.md` under the isolated data root.

The second isolated run proved cross-run identity and persistence, then challenged concurrency and removal:

- owner hash unchanged across restart;
- corrected and multilingual active memories visible;
- same-day score count remained one;
- simultaneous second launch exited 1 and failed closed;
- five incorrect removal confirmations were refused;
- the exact phrase removed the full data directory, including a synthetic nested unexpected file;
- an already-absent directory is idempotent at the removal library boundary;
- Windows removal succeeded while a synthetic nested file had an open read handle;
- all synthetic roots and temporary harnesses were removed after evidence capture.

The final fresh-context run started from another empty isolated root after all implementation changes: 19/19 first-session prompts and 2/2 removal prompts completed; health, remember, exact correction, real local recall, indirect approval hold, seven-part score, clean shutdown, restart, and exact removal all passed. It ended with one active memory, one retired memory, one score row, zero stderr, and no remaining data directory.

### Model/Ollama failure injection

Temporary loopback HTTP servers (no external network) drove the real health command through four observable outcomes:

| Scenario | Expected | Observed |
|---|---|---|
| Valid responses delayed 250 ms per request | Pass | exit 0; every health check passed; local response 810 ms |
| Empty Qwen response | Fail closed | exit 1; `FAIL localQwenWorked`; no session opened |
| No installed models | Fail closed | exit 1; degraded; exact model/embedding checks failed |
| Unreachable loopback port | Fail closed | exit 1; offline; no session opened |

The provider regression suite separately covers request timeout, cancellation, non-JSON/structured failures, model missing, redacted offline errors, and no cloud fallback in `local_only` mode.

### Filesystem and privacy boundary

- Launcher passed when invoked from a working directory and isolated data path containing spaces.
- Dynamic credential sentinels were absent from the child but present again in the parent after health exit.
- Junction target content remained untouched and the junction was rejected.
- State writes use unique temporary files plus rename; temporary files are removed on error.
- Console/error paths do not print prompts, stored memory payloads, credentials, or provider values. Synthetic content was used throughout.
- No WhatsApp, email, calendar, purchase, post, deploy, Railway, Vercel, database, or public-account action was invoked.

## Test matrix summary

| Area | Covered |
|---|---|
| Clean/repeated startup, restart identity, paths with spaces, simultaneous launch, EOF | Yes |
| Empty/whitespace, long, multiline, Unicode, special characters, URL/path, duplicates, conflicts, 50-memory limit | Yes |
| Correction invalid selection, exact retirement, duplicate/injection replacement, stale exclusion, restart | Yes |
| Forget exact selection and retired-record behavior | Unit + live command-path structure; no real owner data |
| Score invalid/cancel/complete/same-day update/seven-day render/Markdown failure | Yes |
| Injection storage/retrieval and indirect approval phrases | Yes |
| Invalid/oversized JSON, duplicate IDs/dates, owner mismatch, junctions, nested/unexpected files | Yes |
| Missing/empty/slow/unreachable model and provider timeout/cancellation | Yes |
| Exact removal wrong case/spaces/blank/partial, repeated/absent, nested/open file | Yes |

## Final verification gates

This table is updated from the final committed tree. A command is not marked pass until completion output is captured.

| Command | Result |
|---|---|
| Focused owner-alpha + Local Brain regression tests | PASS: 2 files / 97 tests |
| `pnpm typecheck` | PASS: shared, bot, dashboard |
| `pnpm lint` | PASS: 0 errors; 6 pre-existing warnings |
| `pnpm test` | PASS: 211 files / 1,100 tests |
| `pnpm build` | PASS: bot and production dashboard build |
| `pnpm run local-brain:release-gate` | PASS: policy 36/36; retrieval 25/25; top-1/top-3/grounding 1.0; zero privacy/injection/stale failures |
| `pnpm run local-brain:browser-proof` | PASS after sandbox browser-spawn retry; evidence `output/playwright/local-brain-browser-proof/2026-07-19T12-50-27-987Z/evidence.json` |
| `pnpm run whatsapp:release-gate` | PASS after sandbox Vitest retry; dry scope, no sends/provider actions/Railway mutation |
| `pnpm test:e2e` | PASS: 19/19 Chromium tests |
| `pnpm run security:deep` | FAIL: Semgrep completed with 36 blocking pre-existing findings outside owner-alpha files; fail-fast did not reach audit |
| `pnpm audit --audit-level=moderate` | FAIL: 9 pre-existing dependency advisories (4 high, 5 moderate) |

## Known limitations and residual risk

- The local JSON/Markdown store is not separately encrypted; Windows account access is the local boundary. Only low-risk data belongs in this alpha.
- Conflicting non-identical facts are deliberately retained until Nitesh chooses the exact stale row with `/correct`; the alpha does not guess which truth wins.
- Hard power loss during synchronous directory removal cannot be deterministically injected without risking the machine. Re-running the exact removal flow removes any remainder; a locked-file failure is explicit rather than reported as success.
- Ctrl+C is covered by the same readline-close/abort path as the observed EOF test, but synthetic console control-event injection was not available in this harness.
- Retrieval quality with 30 synthetic memories completed in 697 ms and the release benchmark covers the fixed corpus; seven days of personal usefulness still requires Nitesh's actual daily scorecard.
- Public sale remains blocked by the existing multi-user/account and tenant-review gates. This report makes no beta, AppSumo, deployment, or production-readiness claim.
- The repo-wide security gate is not green. Semgrep flags mutable GitHub Action tags, missing dependency cooldown/trust policy, and existing prospect-demo ffmpeg child-process calls. The audit flags `form-data`, `nodemailer`, `ws`, `vite`, and `js-yaml` dependency paths. None is imported by the owner-alpha Local Brain entry path, and no unrelated dependency/CI/demo file was changed in this narrow patch; they remain blockers for a broader release claim.

## Constitution decision

No Constitution rule was added. These fixes enforce already-established owner scoping, prompt-injection filtering, privacy-safe output, approval gating, safe destructive behavior, and test-before-release requirements; no new product invariant was required.
