$ErrorActionPreference = "Stop"

$snapshotPath = "docs/whatsapp-reply-snapshots.md"
$before = ""

if (Test-Path $snapshotPath) {
    $before = Get-Content $snapshotPath -Raw
}

pnpm run whatsapp:reply-snapshots
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

if (-not (Test-Path $snapshotPath)) {
    Write-Error "WhatsApp reply snapshot file is missing: $snapshotPath"
    exit 1
}

$after = Get-Content $snapshotPath -Raw

if ($before -ne $after) {
    Write-Error "WhatsApp reply snapshots are stale. Run pnpm run whatsapp:reply-snapshots and commit docs/whatsapp-reply-snapshots.md."
    exit 1
}

Write-Host "WhatsApp reply snapshots are current."
