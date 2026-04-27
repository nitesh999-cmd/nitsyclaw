# NitsyClaw silent launcher. Spawns bot + dashboard HIDDEN with output to log files.
$ErrorActionPreference = 'Continue'
$root = 'C:\Users\Nitesh\projects\NitsyClaw'
$logDir = 'C:\Users\Nitesh\projects\NitsyClaw\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Kill any stale node processes so we don't double-up
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# Clear stale wa-session locks
Remove-Item -Force "$root\apps\bot\.wa-session\session\SingletonLock" -ErrorAction SilentlyContinue
Remove-Item -Force "$root\apps\bot\.wa-session\session\SingletonCookie" -ErrorAction SilentlyContinue
Remove-Item -Force "$root\apps\bot\.wa-session\session\SingletonSocket" -ErrorAction SilentlyContinue

# Start dashboard HIDDEN. Output goes to dashboard.log
Start-Process powershell -WindowStyle Hidden -ArgumentList @(
    '-ExecutionPolicy','Bypass',
    '-NoLogo','-NoProfile',
    '-Command',
    "Set-Location '$root'; pnpm dashboard *>> '$logDir\dashboard.log'"
)

Start-Sleep -Seconds 3

# Start bot HIDDEN. Output goes to bot.log
Start-Process powershell -WindowStyle Hidden -ArgumentList @(
    '-ExecutionPolicy','Bypass',
    '-NoLogo','-NoProfile',
    '-Command',
    "Set-Location '$root'; pnpm bot *>> '$logDir\bot.log'"
)

# Touch a heartbeat file so watchdog/broom knows we just launched
'launched at ' + (Get-Date) | Out-File -Append "$logDir\launcher.log"