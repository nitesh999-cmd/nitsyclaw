# NitsyClaw bot-only launcher. Only kills/starts the bot (not dashboard).
# Idempotent: if bot is already alive, exits without doing anything.
# Called by the broom when bot is dead.

$ErrorActionPreference = 'Continue'
$root = 'C:\Users\Nitesh\projects\NitsyClaw'
$logDir = 'C:\Users\Nitesh\projects\NitsyClaw\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Already alive? Exit. Avoids killing the bot mid-message.
$alive = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*tsx*src/index.ts*' }
if ($alive) {
    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] launch-bot: already alive (PID $($alive.ProcessId | Select-Object -First 1)), skipping" |
        Out-File -Append "$logDir\launcher.log"
    exit 0
}

# Clear stale wa-session locks (only if bot was dead — safe)
Remove-Item -Force "$root\apps\bot\.wa-session\session\SingletonLock" -ErrorAction SilentlyContinue
Remove-Item -Force "$root\apps\bot\.wa-session\session\SingletonCookie" -ErrorAction SilentlyContinue
Remove-Item -Force "$root\apps\bot\.wa-session\session\SingletonSocket" -ErrorAction SilentlyContinue

# Start bot HIDDEN. Output goes to bot.log
Start-Process powershell -WindowStyle Hidden -ArgumentList @(
    '-ExecutionPolicy','Bypass',
    '-NoLogo','-NoProfile',
    '-Command',
    "Set-Location '$root'; pnpm bot *>> '$logDir\bot.log'"
)
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] launch-bot: spawned" |
    Out-File -Append "$logDir\launcher.log"
