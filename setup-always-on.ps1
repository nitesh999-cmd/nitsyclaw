# NitsyClaw Always-On Local Setup
# One-time setup script. Run as Administrator.
#
# What it does:
#   1. Configures Windows power so the laptop does not sleep
#   2. Sets lid close to do nothing where supported
#   3. Starts only the local WhatsApp bot on login
#   4. Registers the broom watchdog to supervise only the bot
#
# Run: powershell -ExecutionPolicy Bypass -File C:\Users\Nitesh\projects\NitsyClaw\setup-always-on.ps1

#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"
$root = "C:\Users\Nitesh\projects\NitsyClaw"
$launcher = "$root\launch-bot.ps1"
$broom = "$root\broom.ps1"
$broomSilent = "$root\broom-silent.vbs"

if (-not (Test-Path $root)) {
    Write-Host "ERROR: Project not found at $root" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $launcher)) {
    Write-Host "ERROR: launch-bot.ps1 not found." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $broom)) {
    Write-Host "ERROR: broom.ps1 not found." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $broomSilent)) {
    Write-Host "ERROR: broom-silent.vbs not found." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " NitsyClaw Always-On Setup" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/4] Power plan: prevent sleep / hibernate..." -ForegroundColor Yellow
powercfg /change standby-timeout-ac 0       | Out-Null
powercfg /change standby-timeout-dc 0       | Out-Null
powercfg /change hibernate-timeout-ac 0     | Out-Null
powercfg /change hibernate-timeout-dc 0     | Out-Null
powercfg /change disk-timeout-ac 0          | Out-Null
powercfg /change disk-timeout-dc 0          | Out-Null
powercfg /change monitor-timeout-ac 30      | Out-Null
powercfg /change monitor-timeout-dc 15      | Out-Null
Write-Host "  done" -ForegroundColor Green

Write-Host "[2/4] Lid close: do nothing where supported..." -ForegroundColor Yellow
$lidCloseGuid = "5ca83367-6e45-459f-a27b-476b1d01c936"
$subButtons = "4f971e89-eebd-4455-a8de-9e59040e7347"
try {
    powercfg /setacvalueindex SCHEME_CURRENT $subButtons $lidCloseGuid 0 2>$null | Out-Null
    powercfg /setdcvalueindex SCHEME_CURRENT $subButtons $lidCloseGuid 0 2>$null | Out-Null
    powercfg /setactive SCHEME_CURRENT | Out-Null
    Write-Host "  done" -ForegroundColor Green
} catch {
    Write-Host "  skipped" -ForegroundColor Yellow
}

Write-Host "[3/4] Creating bot-only auto-start shortcut..." -ForegroundColor Yellow
$shortcutPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\NitsyClaw.lnk"
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($shortcutPath)
$sc.TargetPath = "powershell.exe"
$sc.Arguments = "-ExecutionPolicy Bypass -WindowStyle Hidden -NoProfile -File `"$launcher`""
$sc.WorkingDirectory = $root
$sc.WindowStyle = 7
$sc.Description = "Start NitsyClaw WhatsApp bot on login"
$sc.Save()
Write-Host "  shortcut at: $shortcutPath" -ForegroundColor Green

Write-Host "[4/4] Registering broom watchdog task..." -ForegroundColor Yellow
$taskName = "NitsyClaw Broom"
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$broomSilent`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 2)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -Hidden
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType Interactive

Unregister-ScheduledTask -TaskName "NitsyClaw Watchdog" -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null

Write-Host "  broom task registered (checks every 2 min)" -ForegroundColor Green

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " Done." -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " Current local model:" -ForegroundColor White
Write-Host "  - Dashboard runs on Vercel, not on the laptop watchdog" -ForegroundColor Gray
Write-Host "  - launch-bot.ps1 starts only the WhatsApp bot" -ForegroundColor Gray
Write-Host "  - broom.ps1 restarts only the bot when dead or stale" -ForegroundColor Gray
Write-Host "  - no local setup path calls nuke-and-go.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host " Logs: $root\logs\broom.log and $root\logs\bot.log" -ForegroundColor Gray
