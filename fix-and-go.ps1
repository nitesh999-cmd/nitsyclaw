# NitsyClaw fix-and-go script
# Run: powershell -ExecutionPolicy Bypass -File C:\Users\Nitesh\projects\NitsyClaw\fix-and-go.ps1
#
# What it does:
#   1. Kills zombie node + chromium processes
#   2. Strips BOM from every package.json in the project
#   3. Validates every package.json is parseable JSON
#   4. Clears stale build caches
#   5. Clears wa-session locks
#   6. Launches dashboard + bot in two new windows
#
# Safe to run anytime things break. It's idempotent.

$ErrorActionPreference = "Stop"
$root = "C:\Users\Nitesh\projects\NitsyClaw"

if (-not (Test-Path $root)) {
    Write-Host "ERROR: Project not found at $root" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " NitsyClaw fix-and-go" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Kill zombie processes
Write-Host "[1/6] Killing zombie node + chromium processes..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*Puppeteer*" -or $_.Path -like "*wa-session*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Write-Host "  done" -ForegroundColor Green

# 2. Strip BOM from every package.json
Write-Host "[2/6] Stripping BOM from package.json files..." -ForegroundColor Yellow
$enc = New-Object System.Text.UTF8Encoding $false
$jsonFiles = Get-ChildItem -Path $root -Recurse -Filter "package.json" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notlike "*node_modules*" }

$fixed = 0
foreach ($f in $jsonFiles) {
    $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) {
        # Has BOM. Strip it and rewrite.
        $content = [System.IO.File]::ReadAllText($f.FullName).TrimStart([char]0xFEFF)
        [System.IO.File]::WriteAllText($f.FullName, $content, $enc)
        Write-Host "  fixed BOM: $($f.FullName.Substring($root.Length+1))" -ForegroundColor Green
        $fixed++
    }
}
Write-Host "  $fixed file(s) had BOM, now clean" -ForegroundColor Green

# 3. Validate every package.json
Write-Host "[3/6] Validating JSON..." -ForegroundColor Yellow
$bad = @()
foreach ($f in $jsonFiles) {
    try {
        Get-Content $f.FullName -Raw | ConvertFrom-Json | Out-Null
    } catch {
        $bad += $f.FullName
        Write-Host "  INVALID: $($f.FullName.Substring($root.Length+1))" -ForegroundColor Red
        Write-Host "    $($_.Exception.Message)" -ForegroundColor Red
    }
}
if ($bad.Count -gt 0) {
    Write-Host ""
    Write-Host "ERROR: $($bad.Count) package.json file(s) are invalid JSON. Fix them manually before continuing." -ForegroundColor Red
    Write-Host "Files:" -ForegroundColor Red
    $bad | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    exit 1
}
Write-Host "  $($jsonFiles.Count) file(s) all valid" -ForegroundColor Green

# 4. Clear stale build cache
Write-Host "[4/6] Clearing stale Next.js build cache..." -ForegroundColor Yellow
Remove-Item -Recurse -Force "$root\apps\dashboard\.next" -ErrorAction SilentlyContinue
Write-Host "  done" -ForegroundColor Green

# 5. Clear WhatsApp session locks (but keep the auth)
Write-Host "[5/6] Clearing WhatsApp session locks..." -ForegroundColor Yellow
Remove-Item -Force "$root\apps\bot\.wa-session\session\SingletonLock" -ErrorAction SilentlyContinue
Remove-Item -Force "$root\apps\bot\.wa-session\session\SingletonCookie" -ErrorAction SilentlyContinue
Remove-Item -Force "$root\apps\bot\.wa-session\session\SingletonSocket" -ErrorAction SilentlyContinue
Write-Host "  done" -ForegroundColor Green

# 6. Launch in two new windows
Write-Host "[6/6] Launching dashboard + bot..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit","-Command","cd $root; Write-Host '== DASHBOARD ==' -ForegroundColor Cyan; pnpm dashboard"
Start-Sleep -Seconds 3
Start-Process powershell -ArgumentList "-NoExit","-Command","cd $root; Write-Host '== BOT ==' -ForegroundColor Cyan; pnpm bot"
Write-Host "  two new PowerShell windows opened" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Done." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " Dashboard: http://localhost:3000  (or :3001)"
Write-Host " Bot:       watch the bot window for [boot] WhatsApp ready"
Write-Host ""
Write-Host " To stop: Ctrl+C in each window."
Write-Host " To restart: re-run this script."
Write-Host ""
