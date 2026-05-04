$ErrorActionPreference = "Stop"

Write-Host "== NitsyClaw safe release preflight =="
Write-Host ""

Write-Host "[1/5] Git branch/status"
git status --short --branch
if ($LASTEXITCODE -ne 0) {
    throw "git status failed"
}

Write-Host ""
Write-Host "[2/5] Git remote"
$remote = git remote get-url origin
if ($LASTEXITCODE -ne 0) {
    throw "git remote get-url origin failed"
}
Write-Host "origin $remote"
if ($remote -match "https://[^/\s]+@github\.com") {
    throw "Unsafe git remote: credentials are embedded in origin."
}

Write-Host ""
Write-Host "[3/5] Diff whitespace check"
git diff --check
if ($LASTEXITCODE -ne 0) {
    throw "git diff --check failed"
}

Write-Host ""
Write-Host "[4/5] Release check"
pnpm release:check
if ($LASTEXITCODE -ne 0) {
    throw "pnpm release:check failed"
}

Write-Host ""
Write-Host "[5/5] Final status"
git status --short
if ($LASTEXITCODE -ne 0) {
    throw "git status --short failed"
}

Write-Host ""
Write-Host "Preflight passed. Review staged files manually before commit/push."
