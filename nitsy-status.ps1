# NitsyClaw status check.
$root = "C:\Users\Nitesh\projects\NitsyClaw"
$logDir = "$root\logs"

Write-Host ""
Write-Host "=== NitsyClaw status ===" -ForegroundColor Cyan
Write-Host ""

$bot = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*tsx*src/index.ts*" }
if ($bot) {
    Write-Host ("Bot:       RUNNING (PID " + $bot.ProcessId + ")") -ForegroundColor Green
} else {
    Write-Host "Bot:       NOT RUNNING" -ForegroundColor Red
}

$dash = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*next*dev*" }
if ($dash) {
    Write-Host ("Dashboard: RUNNING (PID " + $dash.ProcessId + ")") -ForegroundColor Green
} else {
    Write-Host "Dashboard: NOT RUNNING" -ForegroundColor Red
}

$task = Get-ScheduledTask -TaskName "NitsyClaw Broom" -ErrorAction SilentlyContinue
if ($task) {
    Write-Host ("Broom:     " + $task.State + " (auto-restarts NitsyClaw every 2 min if dead)") -ForegroundColor Green
} else {
    Write-Host "Broom:     NOT REGISTERED" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Logs:" -ForegroundColor Cyan
Write-Host ("  Bot:       " + $logDir + "\bot.log")
Write-Host ("  Dashboard: " + $logDir + "\dashboard.log")
Write-Host ("  Broom:     " + $logDir + "\broom.log")
Write-Host ""
Write-Host "Tail bot log:       Get-Content `"$logDir\bot.log`" -Tail 20"
Write-Host "Tail dashboard log: Get-Content `"$logDir\dashboard.log`" -Tail 20"
Write-Host "Restart all:        powershell -ExecutionPolicy Bypass -File `"$root\silent-launcher.ps1`""
Write-Host ""