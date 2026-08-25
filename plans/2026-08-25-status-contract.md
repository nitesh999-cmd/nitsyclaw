# 2026-08-25 — Status contract

STANDING RULES
- No claim without a receipt captured in this session, pasted verbatim.
- Route, tools and steps are locked at acceptance. Changing them needs two receipts
  (lock-time + failure-time) proving the world changed mid-execution, or a PAUSE.
- Never instruct the owner to do manually what a tool here can do. User-only actions
  are declared in the contract, never sprung mid-task.
- Risky is the default. A step is routine only if read-only or one-command reversible
  AND depends on nothing off this machine.

Status: ACCEPTED
Clock at acceptance: Tuesday 25 August 2026, 7:54:50 pm AEST (R1b)

---

## 1. MISSION (definition of done)

Ship the voice-into-audit release to production and leave it verifiably healthy: merged
to `main`, deployed to Railway (no-client) and the laptop (session owner), with CI gates
that actually test the post-cutover architecture and a documented closeout in the repo.

Finished = `main` green and protected; laptop running the release commit with its WhatsApp
session intact; every gate honest; every unresolved defect either fixed, or filed with
evidence and a named owner.

**Drift disclosure — veto this if wrong.** The original goal (Phase 4/5 of the voice
release) is DONE. Work then drifted, through legitimate follow-the-evidence steps, into
two unplanned tracks: (a) inbound media download is broken, and (b) the bot dies silently
and repeatedly. My interpretation of the current mission is: **close out the release
formally, and resolve or formally park those two tracks.** Neither is a voice-release
requirement; both are production-health issues discovered by it.

---

## 2. DONE SO FAR (verified live this session)

| # | Item | Evidence (receipt) |
|---|---|---|
| 1 | PR #21 merged — Railway gate repointed at the no-client invariant | R4: `#21 [MERGED] 44660bd` |
| 2 | PR #23 merged — e2e Playwright-install hang fixed (timeout + cache) | R4: `#23 [MERGED] e6ff445` |
| 3 | PR #24 merged — error logging survives minification (`ctor=`/`code=`/`stack=`) | R4: `#24 [MERGED] 4490f03` |
| 4 | PR #25 merged — `downloadMedia` boundary capture + per-field redaction | R4: `#25 [MERGED] 309946d` |
| 5 | Branch protection live on `main` | R6: `strict=true contexts=test,windows,security,e2e,zap-baseline enforce_admins=true force_push=false` |
| 6 | Issue #22 filed — e2e hang, with both attempt times and baselines | R5: `ISSUE #22 e2e job hangs on playwright install...` |
| 7 | Laptop on release commit, session intact, single instance | R9: `status=ok ready=true state=CONNECTED commit=309946d`, `instances: 1`, `broom: Ready` |
| 8 | Railway healthy in no-client mode | R10: `/healthz=200 qr=404`, `"ready":false,"reason":"runtime_not_owner"` |
| 9 | Puppeteer revert rejected on evidence; guards intact | R7: `35: puppeteer@<25.5.0: '25.5.0'`, `225: rejects [... "24.38.0" ...]`, resolved `25.5.0` |
| 10 | Upstream evidence posted to wwebjs#201833 | R8: `id=5406711159 … created=2026-08-25T07:00:15Z`, 2766 chars |
| 11 | Release closeout doc on `main` | R13: `docs/releases/2026-08-19-voice-release-closeout.md` (7648 bytes) |

CARRIED (established earlier, NOT re-verified today — do not treat as receipted):
migration journal counts (13 rows, four voice tables, owner_hash=15) and the encrypted
dump digest `6d4f9607…`.

---

## 3. REMAINING ROUTE

Dependency receipts for this route, all captured 2026-08-25 (see §6).

| # | Step | Risk | Receipt | Fallback |
|---|---|---|---|---|
| 1 | Write this plan file + mind.md sections | routine | R2 (`mind.md` 3604 lines, `plans/` created) | n/a |
| 2 | Commit docs via PR (NOT direct push) | risky | R14: `required_PR_reviews=true enforce_admins=true` — direct push to `main` is blocked | If checks hang (issue #22 class), leave PR open and report; do not force |
| 3 | Test the `id._serialized` → `id.$1` hypothesis | risky | R11: three call sites at `wwebjs-client.ts:727,740,832` | If id shape is unchanged, report hypothesis refuted; do not patch blind |
| 4 | If confirmed: adapter fix + PR + deploy + one media test | risky | depends on step 3 | If fix fails, revert to `309946d` (30-min window) |
| 5 | Resolve or park the six silent bot deaths | risky | R9 (bot up now, new logging live) | If no death recurs, park with a watch note |

**Step 2 is the only step in scope right now.** Steps 3–5 need explicit owner
authorization — they touch production and the WhatsApp session.

---

## 4. RISKS & BLOCKERS

| Risk | Impact | Mitigation |
|---|---|---|
| Direct push to `main` is blocked (R14) | docs cannot be committed as asked | Route via branch + PR; owner merges |
| e2e job hangs (issue #22) | any PR can stall indefinitely | #23 added 15-min step timeout + cache; observed passing 3x since |
| Inbound media broken (upstream) | voice + image features unusable | Filed upstream; local `$1` lead open (step 3) |
| Six silent bot deaths, no logged cause | PA can vanish unattended | New logging live since `4490f03`; next death should self-name |
| Puppeteer 25.5.0 crosses wwebjs's exact pin | compatibility unknown-but-tested | Proven QR-ready in `c26ad2c`; revert rejected — reintroduces GHSA-jmr9-qjv8-65gv |

**Owner-only (nothing else qualifies):**
1. Elevated PowerShell for `Enable/Disable-ScheduledTask` on Broom — this session is not elevated.
2. Merging PRs is available to me, but branch protection makes every doc change a PR.
3. Authorization for steps 3–5.

---

## 5. OUTCOME

- Step 1: DONE — this file + mind.md sections.
- Step 2: in progress — docs PR.
- Steps 3–5: NOT STARTED, awaiting authorization.

## 6. RECEIPTS (verbatim, 2026-08-25 AEST)

R1b `Tuesday, 25 August 2026 at 7:54:50 pm AEST`
R2  `EXISTS mind.md (3604 lines)` / `EXISTS NitsyClaw-Constitution-v1.0.md` / `MISSING plans/`
R3  `HEAD : 309946d6532b296f794a912b2d8120ae1fd84b80` `branch : main` `dirty : 1 lines`
R4  `#21 [MERGED] 44660bd` `#23 [MERGED] e6ff445` `#24 [MERGED] 4490f03` `#25 [MERGED] 309946d`
R5  `ISSUE #22 e2e job hangs on playwright install --with-deps chromium`
R6  `strict=true contexts=test,windows,security,e2e,zap-baseline enforce_admins=true force_push=false`
R7  `35:  puppeteer@<25.5.0: '25.5.0'` / `225: rejects: ["25.4.9", "24.38.0", ...]` / resolved `25.5.0`
R8  `id=5406711159 author=nitesh999-cmd created=2026-08-25T07:00:15Z` `body_chars=2766`
R9  `status=ok ready=true state=CONNECTED commit=309946d` `broom : Ready` `instances: 1`
R10 `/healthz=200  qr=404` `"ready":false,"reason":"runtime_not_owner"`
R11 `727: m.id?._serialized ?? ""` `740: chat.id?._serialized ?? ""` `832: m.id?._serialized ?? ""`
R12 `'ENVIRONMENT PASSPORT' : 0` `'FIXES LOG' : 0` (sections absent, added by this task)
R13 `docs/releases/2026-08-19-voice-release-closeout.md` 7648 bytes
R14 `required_PR_reviews=true  enforce_admins=true` → direct push to main blocked

## 7. FIXES LOG (violations this session)

| Date | What broke | Root cause | Rule |
|---|---|---|---|
| 2026-08-20 | Production DB writes failed, sqlstate 25006, ~40 min | Ran `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` on the **6543 transaction pooler**; the setting stuck to a shared backend | Never issue session-level SET on a transaction pooler. Plain SELECT only. |
| 2026-08-20 | False "QR presented" alarm | Treated HTTP 200 on `/recovery/whatsapp-qr` as a QR; that endpoint always serves a page shell on the laptop | Assert on the payload (`data:image`/`<canvas`), never the status code |
| 2026-08-21 | Nearly killed the live WhatsApp client | Instruction said "expect the 11 chrome procs from 15:51"; count matched but identity did not | Verify process identity (parent + start time), never count alone |
| 2026-08-25 | Ran `pnpm install --frozen-lockfile` inside the real repo during a sandbox-only comparison | Convenience; brief said disposable directory only | Sandbox work stays in the sandbox |
