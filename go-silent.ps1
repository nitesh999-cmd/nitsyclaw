# NitsyClaw — go silent.
# Stops the visible-PowerShell-window mess. NitsyClaw runs hidden in background
# from now on. You only see windows you explicitly open.
#
# Run as Administrator:
#   powershell -ExecutionPolicy Bypass -File C:\Users\Nitesh\projects\NitsyClaw\go-silent.ps1

#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"
$root = "C:\Users\Nitesh\projects\NitsyClaw"
$logDir = "$root\logs"

if (-not (Test-Path $root)) {
    Write-Host "ERROR: NitsyClaw not found at $root" -ForegroundColor Red
    exit 1
}

# Make logs folder
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " NitsyClaw -> Silent Mode" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================
# 1. Kill ALL currently running NitsyClaw windows + node procs
# ============================================================
Write-Host "[1/6] Killing all current NitsyClaw windows + node processes..." -ForegroundColor Yellow

# Stop watchdog scheduled task if running
Stop-ScheduledTask -TaskName "NitsyClaw Watchdog" -ErrorAction SilentlyContinue

# Kill all node.exe processes (bot, dashboard, watchdog children)
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Kill any PowerShell window whose command line is running NitsyClaw scripts (but NOT the one we're running in now)
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
        $_.ProcessId -ne $PID -and
        $_.CommandLine -and
        ($_.CommandLine -match "NitsyClaw|nuke-and-go|watchdog|nitsyclaw" -or
         $_.CommandLine -match "pnpm bot|pnpm dashboard|next dev|tsx watch")
    } |
    ForEach-Object {
        Write-Host "  killing PID $($_.ProcessId)" -ForegroundColor Gray
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

Start-Sleep -Seconds 2
Write-Host "  done" -ForegroundColor Green

# ============================================================
# 2. Write a hidden launcher (replaces nuke-and-go.ps1's window-spawning behavior)
# ============================================================
Write-Host "[2/6] Writing silent launcher..." -ForegroundColor Yellow

$silentLauncher = @"
# NitsyClaw silent launcher. Spawns bot + dashboard HIDDEN with output to log files.
`$ErrorActionPreference = 'Continue'
`$root = '$root'
`$logDir = '$logDir'
New-Item -ItemType Directory -Force -Path `$logDir | Out-Null

# Kill any stale node processes so we don't double-up
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# Clear stale wa-session locks
Remove-Item -Force "`$root\apps\bot\.wa-session\session\SingletonLock" -ErrorAction SilentlyContinue
Remove-Item -Force "`$root\apps\bot\.wa-session\session\SingletonCookie" -ErrorAction SilentlyContinue
Remove-Item -Force "`$root\apps\bot\.wa-session\session\SingletonSocket" -ErrorAction SilentlyContinue

# Start dashboard HIDDEN. Output goes to dashboard.log
Start-Process powershell -WindowStyle Hidden -ArgumentList @(
    '-ExecutionPolicy','Bypass',
    '-NoLogo','-NoProfile',
    '-Command',
    "Set-Location '`$root'; pnpm dashboard *>> '`$logDir\dashboard.log'"
)

Start-Sleep -Seconds 3

# Start bot HIDDEN. Output goes to bot.log
Start-Process powershell -WindowStyle Hidden -ArgumentList @(
    '-ExecutionPolicy','Bypass',
    '-NoLogo','-NoProfile',
    '-Command',
    "Set-Location '`$root'; pnpm bot *>> '`$logDir\bot.log'"
)

# Touch a heartbeat file so watchdog/broom knows we just launched
'launched at ' + (Get-Date) | Out-File -Append "`$logDir\launcher.log"
"@
[System.IO.File]::WriteAllText("$root\silent-launcher.ps1", $silentLauncher, (New-Object System.Text.UTF8Encoding $false))
Write-Host "  silent-launcher.ps1 written" -ForegroundColor Green

# ============================================================
# 3. Update Startup folder shortcut to use silent launcher
# ============================================================
Write-Host "[3/6] Updating Windows Startup shortcut..." -ForegroundColor Yellow
$shortcutPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\NitsyClaw.lnk"
Remove-Item $shortcutPath -Force -ErrorAction SilentlyContinue
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($shortcutPath)
$sc.TargetPath        = "powershell.exe"
$sc.Arguments         = "-ExecutionPolicy Bypass -WindowStyle Hidden -NoProfile -File `"$root\silent-launcher.ps1`""
$sc.WorkingDirectory  = $root
$sc.WindowStyle       = 7
$sc.Description       = "Start NitsyClaw silently on login"
$sc.Save()
Write-Host "  startup shortcut updated (hidden mode)" -ForegroundColor Green

# ============================================================
# 4. Write the broom (auto-kill stray PS windows that aren't currently being used)
# ============================================================
Write-Host "[4/6] Writing broom (auto-cleanup task)..." -ForegroundColor Yellow

$broom = @"
# NitsyClaw broom. Kills stray PowerShell windows running NitsyClaw scripts
# that have been idle (no foreground focus) for >5 min. Also restarts bot+dashboard
# if they died.
`$ErrorActionPreference = 'Continue'
`$root = '$root'
`$logDir = '$logDir'
New-Item -ItemType Directory -Force -Path `$logDir | Out-Null

# Check bot + dashboard alive
`$bot = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { `$_.CommandLine -like '*tsx*src/index.ts*' }
`$dash = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { `$_.CommandLine -like '*next*dev*' }

if (-not `$bot -or -not `$dash) {
    "[`$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] broom: bot=`$([bool]`$bot) dash=`$([bool]`$dash) -> relaunching" |
        Out-File -Append "`$logDir\broom.log"
    Start-Process powershell -WindowStyle Hidden -ArgumentList @('-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-NoProfile','-File',"`$root\silent-launcher.ps1")
}

# Kill stray powershell.exe windows running NitsyClaw scripts that ARE NOT hidden
# (i.e. visible windows from old manual launches)
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
        `$_.CommandLine -and
        `$_.CommandLine -match 'pnpm bot|pnpm dashboard|next dev|tsx watch|nuke-and-go|nitsyclaw' -and
        `$_.CommandLine -notmatch 'WindowStyle Hidden|silent-launcher'
    } |
    ForEach-Object {
        # Only kill if there's another (newer) hidden one already running the same thing
        try {
            "[`$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] broom: killing visible PID `$(`$_.ProcessId)" |
                Out-File -Append "`$logDir\broom.log"
            Stop-Process -Id `$_.ProcessId -Force -ErrorAction SilentlyContinue
        } catch {}
    }
"@
[System.IO.File]::WriteAllText("$root\broom.ps1", $broom, (New-Object System.Text.UTF8Encoding $false))
Write-Host "  broom.ps1 written" -ForegroundColor Green

# ============================================================
# 5. Re-register watchdog scheduled task to use the broom (every 2 min)
# ============================================================
Write-Host "[5/6] Registering broom scheduled task (every 2 min, hidden)..." -ForegroundColor Yellow

Unregister-ScheduledTask -TaskName "NitsyClaw Watchdog" -Confirm:`$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "NitsyClaw Broom" -Confirm:`$false -ErrorAction SilentlyContinue

`$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -NoProfile -File `"$root\broom.ps1`""
`$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 2)
`$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -Hidden
`$principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType Interactive

Register-ScheduledTask -TaskName "NitsyClaw Broom" -Action `$action -Trigger `$trigger -Settings `$settings -Principal `$principal | Out-Null
Write-Host "  broom task registered (every 2 min)" -ForegroundColor Green

# ============================================================
# 6. Write nitsy-status.ps1 — your manual health check
# ============================================================
Write-Host "[6/6] Writing nitsy-status.ps1..." -ForegroundColor Yellow

$status = @"
# NitsyClaw status check. Run anytime to see what's alive.
# Usage: powershell -ExecutionPolicy Bypass -File C:\Users\Nitesh\projects\NitsyClaw\nitsy-status.ps1

`$root = '$root'
`$logDir = '$logDir'

Write-Host ''
Write-Host '=== NitsyClaw status ===' -ForegroundColor Cyan
Write-Host ''

# Bot
`$bot = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { `$_.CommandLine -like '*tsx*src/index.ts*' }
if (`$bot) {
    Write-Host ("Bot:       RUNNING (PID " + `$bot.ProcessId + ")") -ForegroundColor Green
} else {
    Write-Host 'Bot:       NOT RUNNING' -ForegroundColor Red
}

# Dashboard
`$dash = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { `$_.CommandLine -like '*next*dev*' }
if (`$dash) {
    Write-Host ("Dashboard: RUNNING (PID " + `$dash.ProcessId + ")") -ForegroundColor Green
} else {
    Write-Host 'Dashboard: NOT RUNNING' -ForegroundColor Red
}

# Watchdog/Broom task
`$task = Get-ScheduledTask -TaskName 'NitsyClaw Broom' -ErrorAction SilentlyContinue
if (`$task) {
    Write-Host ("Broom:     " + `$task.State + " (auto-restarts NitsyClaw every 2 min if dead)") -ForegroundColor Green
} else {
    Write-Host 'Broom:     NOT REGISTERED' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Logs:' -ForegroundColor Cyan
Write-Host "  Bot:       `$logDir\bot.log"
Write-Host "  Dashboard: `$logDir\dashboard.log"
Write-Host "  Broom:     `$logDir\broom.log"
Write-Host ''
Write-Host 'Tail bot log:       Get-Content "`$logDir\bot.log" -Tail 20'
Write-Host 'Tail dashboard log: Get-Content "`$logDir\dashboard.log" -Tail 20'
Write-Host 'Restart all:        powershell -ExecutionPolicy Bypass -File "`$root\silent-launcher.ps1"'
Write-Host ''
"@
[System.IO.File]::WriteAllText("$root\nitsy-status.ps1", $status, (New-Object System.Text.UTF8Encoding $false))
Write-Host "  nitsy-status.ps1 written" -ForegroundColor Green

# ============================================================
# 7. Launch silent immediately
# ============================================================
Write-Host ""
Write-Host "Launching NitsyClaw silently..." -ForegroundColor Cyan
Start-Process powershell -WindowStyle Hidden -ArgumentList @('-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-NoProfile','-File',"$root\silent-launcher.ps1")

Start-Sleep -Seconds 8

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Done. NitsyClaw is now SILENT." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " - Bot + dashboard run hidden in background" -ForegroundColor White
Write-Host " - Output goes to log files, not visible windows" -ForegroundColor White
Write-Host " - Broom checks every 2 min and auto-restarts if dead" -ForegroundColor White
Write-Host " - Stray visible windows running old NitsyClaw scripts get killed" -ForegroundColor White
Write-Host ""
Write-Host " Useful commands:" -ForegroundColor Yellow
Write-Host "   powershell -File `"$root\nitsy-status.ps1`"     # check what's alive"
Write-Host "   Get-Content `"$logDir\bot.log`" -Tail 30        # see recent bot log"
Write-Host "   Get-Content `"$logDir\dashboard.log`" -Tail 30  # see recent dashboard log"
Write-Host "   powershell -File `"$root\silent-launcher.ps1`"  # manual restart silently"
Write-Host ""
Write-Host " Test: send 'hello' to NitsyClaw on WhatsApp. Should reply." -ForegroundColor Green
Write-Host ""
