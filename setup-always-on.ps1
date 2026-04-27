# NitsyClaw — Always-On Local Setup
# One-time setup script. Run as Administrator.
#
# What it does:
#   1. Configures Windows power plan so laptop never sleeps
#   2. Sets "do nothing on lid close" (laptop)
#   3. Creates auto-start shortcut so NitsyClaw launches on every login
#   4. Creates a watchdog scheduled task that restarts NitsyClaw if it crashes
#
# Run: powershell -ExecutionPolicy Bypass -File C:\Users\Nitesh\projects\NitsyClaw\setup-always-on.ps1

#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"
$root = "C:\Users\Nitesh\projects\NitsyClaw"
$launcher = "$root\nuke-and-go.ps1"

if (-not (Test-Path $root)) {
    Write-Host "ERROR: Project not found at $root" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $launcher)) {
    Write-Host "ERROR: nuke-and-go.ps1 not found. Run earlier setup first." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " NitsyClaw Always-On Setup" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1 — Power plan: never sleep
Write-Host "[1/4] Power plan: prevent sleep / hibernate..." -ForegroundColor Yellow
powercfg /change standby-timeout-ac 0       | Out-Null
powercfg /change standby-timeout-dc 0       | Out-Null
powercfg /change hibernate-timeout-ac 0     | Out-Null
powercfg /change hibernate-timeout-dc 0     | Out-Null
powercfg /change disk-timeout-ac 0          | Out-Null
powercfg /change disk-timeout-dc 0          | Out-Null
powercfg /change monitor-timeout-ac 30      | Out-Null  # display can sleep, that's fine
powercfg /change monitor-timeout-dc 15      | Out-Null
Write-Host "  done" -ForegroundColor Green

# Step 2 — Lid close action: do nothing (laptop only; harmless on desktop)
Write-Host "[2/4] Lid close: do nothing (so closing lid doesn't sleep)..." -ForegroundColor Yellow
$LIDCLOSE_GUID  = "5ca83367-6e45-459f-a27b-476b1d01c936"
$SUB_BUTTONS    = "4f971e89-eebd-4455-a8de-9e59040e7347"
try {
    powercfg /setacvalueindex SCHEME_CURRENT $SUB_BUTTONS $LIDCLOSE_GUID 0 2>$null | Out-Null
    powercfg /setdcvalueindex SCHEME_CURRENT $SUB_BUTTONS $LIDCLOSE_GUID 0 2>$null | Out-Null
    powercfg /setactive SCHEME_CURRENT       | Out-Null
    Write-Host "  done (lid close = do nothing)" -ForegroundColor Green
} catch {
    Write-Host "  skipped (desktop PC, no lid)" -ForegroundColor Yellow
}

# Step 3 — Auto-start on login
Write-Host "[3/4] Creating auto-start shortcut..." -ForegroundColor Yellow
$shortcutPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\NitsyClaw.lnk"
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($shortcutPath)
$sc.TargetPath        = "powershell.exe"
$sc.Arguments         = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""
$sc.WorkingDirectory  = $root
$sc.WindowStyle       = 7  # minimized
$sc.Description       = "Start NitsyClaw on login"
$sc.Save()
Write-Host "  shortcut at: $shortcutPath" -ForegroundColor Green

# Step 4 — Watchdog scheduled task: every 5 min, check and restart if dead
Write-Host "[4/4] Creating watchdog task (checks every 5 min)..." -ForegroundColor Yellow

$watchdogPath = "$root\watchdog.ps1"
@"
# NitsyClaw watchdog. Runs every 5 min.
# If bot or dashboard process is gone, re-launches via nuke-and-go.ps1.
`$root = `"$root`"
`$botRunning = Get-CimInstance Win32_Process -Filter `"Name = 'node.exe'`" -ErrorAction SilentlyContinue |
    Where-Object { `$_.CommandLine -like `"*tsx*src/index.ts*`" -or `$_.CommandLine -like `"*nitsyclaw/bot*`" }
`$dashRunning = Get-CimInstance Win32_Process -Filter `"Name = 'node.exe'`" -ErrorAction SilentlyContinue |
    Where-Object { `$_.CommandLine -like `"*next*dev*`" -or `$_.CommandLine -like `"*nitsyclaw/dashboard*`" }

if (-not `$botRunning -or -not `$dashRunning) {
    `"[`$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Watchdog: bot or dashboard down, restarting...`" | Out-File -Append `"`$root\watchdog.log`"
    Start-Process powershell -ArgumentList `"-ExecutionPolicy`",`"Bypass`",`"-WindowStyle`",`"Hidden`",`"-File`",`"`$root\nuke-and-go.ps1`"
}
"@ | Set-Content -Path $watchdogPath -Encoding UTF8

# Register the scheduled task
$taskName = "NitsyClaw Watchdog"
$action   = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watchdogPath`""
$trigger  = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -Hidden
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType Interactive

# Remove existing if present
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
Write-Host "  watchdog task registered (checks every 5 min)" -ForegroundColor Green

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " Done." -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " What's now in place:" -ForegroundColor White
Write-Host "  - Laptop never sleeps / hibernates" -ForegroundColor Gray
Write-Host "  - Closing lid does nothing (laptop only)" -ForegroundColor Gray
Write-Host "  - Display can sleep (your screen turns off, NitsyClaw stays running)" -ForegroundColor Gray
Write-Host "  - On every Windows login: NitsyClaw auto-starts" -ForegroundColor Gray
Write-Host "  - Every 5 min: watchdog checks bot+dashboard, restarts if dead" -ForegroundColor Gray
Write-Host ""
Write-Host " Logs at: $root\watchdog.log" -ForegroundColor Gray
Write-Host ""
Write-Host " Test: restart your PC. Within 30 sec of login, NitsyClaw should be alive." -ForegroundColor Yellow
Write-Host ""
