$ErrorActionPreference = "Stop"

Write-Host "== NitsyClaw deep security gate =="

& "$PSScriptRoot\semgrep-scan.ps1"
if ($LASTEXITCODE -ne 0) {
    throw "Semgrep gate failed."
}

pnpm audit --audit-level=moderate
if ($LASTEXITCODE -ne 0) {
    throw "pnpm audit failed."
}

Write-Host "Deep security gate passed."
