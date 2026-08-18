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

### 3. Move the checkout to merged `main`

```powershell
Set-Location "C:\Users\Nitesh\projects\NitsyClaw"
git fetch origin
git status --porcelain
git checkout main
git pull --ff-only origin main
git rev-parse HEAD
pnpm install --frozen-lockfile
```

`git status` should show only the known zero-byte junk and `output/`.
`git rev-parse HEAD` must equal the merge commit on `origin/main`.

**Stop conditions:** any tracked file shows as modified; `git checkout` reports it
would overwrite local changes; `--ff-only` refuses; `pnpm install` fails.

The 27 zero-byte files and `output/` are untracked and do not block a checkout.
Deleting them is optional housekeeping and is **not** part of this cutover.

### 4. Set ownership explicitly

In `~/.nitsyclaw/secrets/.env.local`:

- Set `NITSYCLAW_WHATSAPP_RUNTIME_OWNER=laptop`
- **Leave `NITSYCLAW_ALLOW_LOCAL_WHATSAPP=1` exactly as it is.** The laptop still
  requires it; ownership alone does not authorize a local client.

Setting the value is not strictly required — the guard already returns `client`
for a laptop runtime with the owner unset and `ALLOW=1`, which is today's live
configuration. Set it anyway: it makes ownership explicit on both sides rather
than implied by absence, and it is what makes the laptop stand down if ownership
is ever handed to Railway.

### 5. Start via the real launcher

```powershell
powershell -ExecutionPolicy Bypass -NoProfile -File "C:\Users\Nitesh\projects\NitsyClaw\launch-bot.ps1"
```

Use the launcher, not a bare `pnpm` command: it produces the command line Broom
matches on, and applies the same `Test-LocalWhatsAppAllowed` gate.

### 6. Prove readiness

```powershell
Invoke-RestMethod http://127.0.0.1:3010/health | ConvertTo-Json -Depth 4
```

Required: `status = ok`, `whatsapp.ready = true`, `whatsapp.runtime.state = CONNECTED`.
Also confirm `runtime.commitShort` matches the merge commit.

**Stop condition:** if a QR is presented, **do not scan it**. A QR means the
session was not reused. Stop and follow the rollback path.

Allow up to 5 minutes for `CONNECTED`. Longer is a failure, not slowness.

### 7. Re-enable Broom and prove exactly one instance

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

**Maximum window: 30 minutes from step 2.** If readiness is not proven by then,
roll back rather than keep debugging with the bot down.

Same sequence, reversed target:

1. `Disable-ScheduledTask -TaskName "NitsyClaw Broom"`; prove `Disabled`.
2. Stop the bot; prove no node/Chromium process and no `/health`.
3. `git checkout e131b52`; `pnpm install --frozen-lockfile`.
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
