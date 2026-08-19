# Laptop cutover — moving the WhatsApp runtime onto merged `main`

The laptop owns the WhatsApp session. This runbook moves the laptop from the
checkout it runs today onto merged `main`, without ever letting two clients hold
the session at once and without forcing a re-pair.

**Nothing in this file has been executed.** It is written to be followed by an
operator, step by step, after Phase 4.

## What is true today (measured 2026-08-17)

| | |
|---|---|
| Laptop checkout | `C:\Users\Nitesh\projects\NitsyClaw` |
| Branch / commit | `codex/whatsapp-voice-intelligence` @ `e131b52` |
| Tracked modifications | **none** — 0 modified tracked files |
| Untracked | 27 zero-byte files with shell-fragment names (`({`, `{,+`, `b.at.getTime()`, …) plus generated `output/playwright/local-brain-browser-proof/`. No env, secret or session files. |
| Ancestry | `e131b52` **is an ancestor of** the PR head. 0 commits exist on the laptop branch that the PR head does not already contain. |
| WhatsApp | `/health` on port 3010 reports `status=ok`, `whatsapp.ready=true`, `runtime.state=CONNECTED` |
| Ownership env | `NITSYCLAW_WHATSAPP_RUNTIME_OWNER` **absent**; `NITSYCLAW_ALLOW_LOCAL_WHATSAPP=1` |
| Watchdog | Scheduled task `NitsyClaw Broom` -> `broom-silent.vbs` -> `broom.ps1`, every **2 minutes** |

Because the laptop commit is already an ancestor of the release branch and
nothing is modified, **there is no local work to lose.** The checkout moves
forward cleanly.

## Preconditions — all must hold before starting

1. Phase 4 migration applied and verified: journal = 13 rows, four voice tables
   present, `owner_hash` columns = 15, zero duplicate journal rows.
2. PR #20 merged to `main` with a normal two-parent merge commit.
3. Railway post-merge deployment **healthy in no-client mode**: `/healthz` = 200,
   `/health` reports `whatsapp.ready=false` with `reason=runtime_not_owner`, and
   `/recovery/whatsapp-qr` returns **404**.
4. `NITSYCLAW_WHATSAPP_RUNTIME_OWNER=laptop` is set on the Railway service.
5. A fresh encrypted database backup exists and its sha256 is recorded.
6. **Ownership is set on both sides, in this order** (see "Ordering" below):
   Railway `NITSYCLAW_WHATSAPP_RUNTIME_OWNER=laptop` **before** the merge, and the
   laptop's `.env.local` gains `NITSYCLAW_WHATSAPP_RUNTIME_OWNER=laptop` **before**
   the restart in step 5.
7. The environment checklist below is satisfied.

### Environment checklist

Audited at `93d17d16` against `main`: **35 environment variable names are newly
referenced, and every one of them is optional or platform-injected. None is
required.** The bot, the container and the dashboard all boot without any new
variable being set. This table is a checklist, not a list of blockers.

| name | required? | laptop | railway | vercel |
|---|---|---|---|---|
| `NITSYCLAW_WHATSAPP_RUNTIME_OWNER` | optional (`z.enum(["laptop","railway"]).optional()`) | absent → **set to `laptop`** | absent → **set to `laptop`** | n/a |
| `NITSYCLAW_ALLOW_LOCAL_WHATSAPP` | optional, read directly | **present** — leave as is | absent (correct) | n/a |
| `NITSYCLAW_MODEL_MODE` | optional, defaults `auto` | absent | absent | absent |
| `OLLAMA_BASE_URL` | optional, defaults `http://127.0.0.1:11434` | absent | absent | absent |
| `OLLAMA_CHAT_MODEL` / `_EMBEDDING_MODEL` / `_TIMEOUT_MS` / `_RETRIES` / `_CONTEXT_LIMIT` / `_KEEP_ALIVE` / `_THINK` | optional | absent | absent | absent |
| `WEB_SEARCH_MAX_USES` | optional, defaults `5` | absent | absent | absent |
| `NITSYCLAW_HTTP_HOST`, `NITSYCLAW_RUNTIME_OWNER` | optional, read directly | absent | absent | n/a |
| `WHATSAPP_NON_SELF_CHAT_NOTICE`, `WHATSAPP_WEB_VERSION_REMOTE_PATH` | optional, read directly | absent | absent | n/a |
| `NITSYCLAW_FFMPEG_PATH`, `NITSYCLAW_FFPROBE_PATH`, `NITSYCLAW_HANDY_PATH` / `_MODEL` / `_DEVICE_INDEX` | optional overrides; blank uses documented Windows defaults | absent | absent | n/a |
| `RAILWAY_*`, `VERCEL`, `LOCALAPPDATA`, `NODE_ENV` | platform-injected | n/a | injected | injected |
| `NITSYCLAW_REHEARSAL_*`, `NITSYCLAW_SYNTHETIC_DB_FIXTURE`, `NITSYCLAW_MIGRATION_REHEARSAL`, `NITSYCLAW_LOCAL_BRAIN_BROWSER_PROOF` | test/rehearsal only — **must never be set in production** | absent | absent | absent |

The only variable this cutover changes is `NITSYCLAW_WHATSAPP_RUNTIME_OWNER`.

One behavioural note, not a blocker: `apps/dashboard` reads `NITSYCLAW_MODEL_MODE`,
`OLLAMA_BASE_URL` and `WEB_SEARCH_MAX_USES`. On Vercel these fall back to their
defaults, and the Ollama default is a loopback address that does not exist in that
runtime — so Local Brain features are simply unavailable on the dashboard. That is
the existing behaviour, unchanged by this release.

### Ordering — why Railway is set before the merge

Railway currently has `NITSYCLAW_WHATSAPP_RUNTIME_OWNER` **absent**. If the merge
lands with it still absent, the new build throws before the health server starts,
the healthcheck fails, and Railway keeps the previous deployment — the older build
whose guard has no ownership check at all. Setting the variable to `laptop` first
(a variable change only, no redeploy) means the post-merge deployment comes up in
no-client mode and becomes healthy, which is what actually retires that old build.

The laptop's copy is set before its restart in step 5, so the laptop declares
ownership explicitly rather than relying on the variable's absence.

If Railway is *not* healthy in no-client mode, stop. A crash-looping Railway
deployment means the previous permissive build is still live, and that build has
no ownership check at all.

## Choose: in-place checkout, not a fresh clone

**Recommended: check out merged `main` in the existing directory.**

`launch-bot.ps1` hardcodes `$root = 'C:\Users\Nitesh\projects\NitsyClaw'`, and
`broom.ps1` resolves the same root. Both scripts live *inside* the repository, so
a fresh clone would ship its own copies still pointing at the old path — the
launcher and watchdog would keep driving the old directory until both files were
hand-edited, in two places, under time pressure, on the machine holding the live
session.

In-place checkout avoids all of that: no path edits, no scheduled-task changes,
and the process command line Broom matches on is unchanged. It is safe here
precisely because the laptop has **0 tracked modifications** and its commit is
already an ancestor of the release — so the checkout is a fast-forward, not a
merge, and cannot conflict.

Use a fresh clone only if the checkout is later found dirty in a way that cannot
be resolved; in that case, edit `$root` in both scripts *before* starting.

## Sequence

### 0. Preflight — prove the browser exists BEFORE stopping anything

Read-only, and the bot stays up throughout. Everything here is a reason to
abandon the cutover at zero cost. Discovering any of it after step 2 means the
bot is already down and the only way out is a rollback.

Two things make the naive Puppeteer check wrong, and both produce a misleading
result rather than an obvious error:

- `apps/bot` does not declare `puppeteer`. It arrives transitively through
  `whatsapp-web.js`, and pnpm's isolated `node_modules` leaves it unresolvable
  from that workspace, so `pnpm --filter @nitsyclaw/bot exec` cannot see it.
- `executablePath()` is **async** in Puppeteer 25. Testing the un-awaited value
  tests the string `[object Promise]`, which reports `False` on a perfectly
  healthy install.

```powershell
$check = Join-Path $env:TEMP 'nitsyclaw-pptr-check.cjs'
@'
const fs = require('fs');
const path = require('path');
const cwd = process.cwd();
const res = (n, from) => require.resolve(n, { paths: [from] });
const wwebDir = path.dirname(res('whatsapp-web.js/package.json', cwd));
const pptr = require(res('puppeteer', wwebDir));
(async () => {
  console.log('PUPPETEER=' + require(res('puppeteer/package.json', wwebDir)).version);
  const ep = await pptr.executablePath();
  console.log('EXEC_PATH=' + ep);
  console.log('EXEC_EXISTS=' + fs.existsSync(ep));
})();
'@ | Set-Content -LiteralPath $check -Encoding UTF8
Set-Location "C:\Users\Nitesh\projects\NitsyClaw\apps\bot"
node $check
```

That reports the browser for the **currently checked-out** Puppeteer. Merged
`main` pins Puppeteer to 25.5.0, which requires Chrome **151.0.7922.71**.
Confirm that build is in the cache before stopping anything:

```powershell
Test-Path "$env:USERPROFILE\.cache\puppeteer\chrome\win64-151.0.7922.71\chrome-win64\chrome.exe"
```

**Stop condition:** if that prints `False`, do not begin the cutover. Install the
build first, with the bot still running, then re-run the check:

```powershell
npx puppeteer browsers install chrome@151.0.7922.71
```

`onlyBuiltDependencies: [puppeteer]` in `pnpm-workspace.yaml` is what lets a
normal `pnpm install` fetch this build itself. Without it pnpm skips puppeteer's
postinstall, `pnpm install` still exits 0, and the missing browser only surfaces
when the bot tries to restore its session. This preflight is the backstop.

If the pinned Puppeteer version in `pnpm-workspace.yaml` changes, re-derive the
required Chrome build rather than trusting the number above.

### 1. Disable Broom first, and prove it

Broom restarts the bot within 2 minutes of it disappearing. If it is still armed
when the bot stops, it will start the **old** code back up mid-cutover.

```powershell
Disable-ScheduledTask -TaskName "NitsyClaw Broom"
(Get-ScheduledTask -TaskName "NitsyClaw Broom").State   # must print: Disabled
```

**Stop condition:** if `State` is anything other than `Disabled`, stop.

### 2. Stop the bot gracefully, and prove the session is released

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*@nitsyclaw/bot*start*" -or
                 $_.CommandLine -like "*apps*bot*tsx*src/index.ts*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId }
```

Then prove nothing still holds the session:

```powershell
(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*@nitsyclaw/bot*" }).Count
(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -like "*nitsyclaw*" -or $_.CommandLine -like "*.wa-session*" }).Count
Invoke-WebRequest http://127.0.0.1:3010/health -TimeoutSec 5
```

Both counts must be `0`, and the health request must fail to connect.

**Stop condition:** if any count is non-zero, or `/health` still answers, stop.
Do not check out anything while a process may hold the session directory.

Note: the live session is at `~/.nitsyclaw/secrets/.wa-session` (resolved by
`whatsappSessionDir`), while `launch-bot.ps1` also clears Chromium singleton
files under `apps\bot\.wa-session\session\`, a legacy path. Do not delete or move
either directory. This cutover never touches session contents.

### 3. Clean the checkout, and prove nothing real is deleted

The 27 untracked files are all **0 bytes** — shell-redirection accidents. Removing
them makes `git status` readable, so the checkout in the next step can be judged at
a glance instead of squinting past noise. Delete **only** empty files and the
generated output directory, and verify emptiness before deleting rather than
trusting the earlier audit.

```powershell
Set-Location "C:\Users\Nitesh\projects\NitsyClaw"
# List any untracked file that is NOT empty, EXCLUDING the generated proof
# directory that the delete block below removes. Without that exclusion this
# scan always prints the Playwright evidence files — screenshots and
# evidence.json are of course non-empty — and the stop condition fires on every
# run, over generated output that is not unreviewed work.
git ls-files --others --exclude-standard |
  Where-Object { $_ -notlike "output/playwright/local-brain-browser-proof/*" } |
  ForEach-Object {
    if ((Test-Path -LiteralPath $_ -PathType Leaf) -and ((Get-Item -LiteralPath $_).Length -gt 0)) { $_ }
  }
```

**Stop condition:** if that command prints ANY path, stop. A non-empty untracked
file is unreviewed work, and this runbook has no authority to delete it.

If it printed nothing:

```powershell
git ls-files --others --exclude-standard | ForEach-Object {
  if ((Test-Path -LiteralPath $_ -PathType Leaf) -and ((Get-Item -LiteralPath $_).Length -eq 0)) {
    Remove-Item -LiteralPath $_ -Force
  }
}
Remove-Item -Recurse -Force "output\playwright\local-brain-browser-proof" -ErrorAction SilentlyContinue
git status --porcelain    # must now be empty
```

**Stop condition:** if `git status --porcelain` is not empty after this, stop.

### 4. Move the checkout to merged `main`

```powershell
git fetch origin
git checkout main
git pull --ff-only origin main
git rev-parse HEAD
pnpm install --frozen-lockfile
```

`git rev-parse HEAD` must equal the merge commit on `origin/main`.

**No build step is required.** `packages/shared` has no `build` script and no
`dist/` — its `exports` map points directly at `./src/*.ts`, and `apps/bot` runs
under `tsx`, which compiles TypeScript on the fly. (`apps/bot`'s own `build` script
is `tsc -p . --noEmit`, a typecheck, not an emit.) So `pnpm install` is the whole
preparation; do not add a build and do not wait for one.

**Stop conditions:** any tracked file shows as modified; `git checkout` reports it
would overwrite local changes; `--ff-only` refuses; `pnpm install` fails.

**Chromium stop condition.** This release moves Puppeteer to 25.5.0, which needs
a different Chrome build than 24.38.0 uses. That build must already have been
proven present by **step 0**, before the bot was stopped. Now that the new
Puppeteer is installed, re-run the same check to confirm it resolves:

```powershell
Set-Location "C:\Users\Nitesh\projects\NitsyClaw\apps\bot"
node $check   # $check is defined in step 0
```

`EXEC_EXISTS` must be `True`. If it is not, roll back rather than improvise:
whatsapp-web.js needs a working browser, and starting without one produces a
confusing failure at session-restore time rather than at install time.

### 5. Set ownership explicitly

In `~/.nitsyclaw/secrets/.env.local`:

- Set `NITSYCLAW_WHATSAPP_RUNTIME_OWNER=laptop`
- **Leave `NITSYCLAW_ALLOW_LOCAL_WHATSAPP=1` exactly as it is.** The laptop still
  requires it; ownership alone does not authorize a local client.

This must happen BEFORE the restart in the next step, so the process that comes
up already declares ownership.

Setting the value is not strictly required — the guard already returns `client`
for a laptop runtime with the owner unset and `ALLOW=1`, which is today's live
configuration. Set it anyway: it makes ownership explicit on both sides rather
than implied by absence, and it is what makes the laptop stand down if ownership
is ever handed to Railway.

### 6. Start via the real launcher

```powershell
powershell -ExecutionPolicy Bypass -NoProfile -File "C:\Users\Nitesh\projects\NitsyClaw\launch-bot.ps1"
```

Use the launcher, not a bare `pnpm` command: it produces the command line Broom
matches on, and applies the same `Test-LocalWhatsAppAllowed` gate.

### 7. Prove readiness

```powershell
Invoke-RestMethod http://127.0.0.1:3010/health | ConvertTo-Json -Depth 4
```

Required: `status = ok`, `whatsapp.ready = true`, `whatsapp.runtime.state = CONNECTED`.
Also confirm `runtime.commitShort` matches the merge commit.

**Stop condition:** if a QR is presented, **do not scan it**. A QR means the
session was not reused. Stop and follow the rollback path.

Allow up to 5 minutes for `CONNECTED`. Longer is a failure, not slowness.

### 8. Re-enable Broom and prove exactly one instance

```powershell
Enable-ScheduledTask -TaskName "NitsyClaw Broom"
(Get-ScheduledTask -TaskName "NitsyClaw Broom").State
Start-Sleep -Seconds 150
(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*@nitsyclaw/bot*start*" }).Count
```

`State` must be `Ready`; the count must be exactly `1` after a full 2-minute cycle.

Broom calls `Start-Bot` only when its matched process count is **0**, so it cannot
spawn a second instance while one is running. This step verifies that in practice.

## Rollback

**Maximum window: 30 minutes from step 2 (the stop).** If readiness is not proven by then,
roll back rather than keep debugging with the bot down.

Same sequence, reversed target:

1. `Disable-ScheduledTask -TaskName "NitsyClaw Broom"`; prove `Disabled`.
2. Stop the bot; prove no node/Chromium process and no `/health`.
3. `git checkout e131b52`; `pnpm install --frozen-lockfile`. No build step.
4. Return `NITSYCLAW_WHATSAPP_RUNTIME_OWNER` to absent (the pre-cutover state).
5. Start via `launch-bot.ps1`; prove `whatsapp.ready=true` and `CONNECTED`.
6. Re-enable Broom; prove exactly one instance.

Rolling the laptop back does **not** require a database rollback: `0011`/`0012`
are additive, so `e131b52` runs unchanged against the migrated schema.

## Stop conditions (any one halts the cutover)

- Broom will not report `Disabled`.
- Any bot or Chromium process survives the stop, or `/health` still answers.
- `git checkout` or `--ff-only` refuses, or tracked files show as modified.
- `pnpm install --frozen-lockfile` fails.
- A QR code is presented at any point.
- `whatsapp.ready=true` and `CONNECTED` are not both reached within 5 minutes.
- More than one bot instance after Broom is re-enabled.
- Railway is not healthy in no-client mode.

## What this runbook never does

Send a WhatsApp message. Scan or re-pair a QR. Delete, move or edit the session
directory. Change a Railway or Vercel setting. Touch the database.
