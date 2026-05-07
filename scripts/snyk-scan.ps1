$ErrorActionPreference = "Stop"

Write-Host "== NitsyClaw Snyk security scan =="

if (-not (Get-Command snyk -ErrorAction SilentlyContinue)) {
    throw "Snyk CLI is not available on PATH. Install and authenticate Snyk before using this gate."
}

if (-not $env:SNYK_TOKEN) {
    Write-Host "SNYK_TOKEN is not set. The CLI may still work if 'snyk auth' has already been completed."
}

snyk test --all-projects --detection-depth=2 --severity-threshold=medium
if ($LASTEXITCODE -ne 0) {
    throw "Snyk security scan failed or is not authenticated. Run 'snyk auth' or set SNYK_TOKEN, then retry."
}

Write-Host "Snyk security scan passed."
