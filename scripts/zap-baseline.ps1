param(
    [string]$Target = "http://host.docker.internal:3101",
    [string]$Report = "zap-report.html"
)

$ErrorActionPreference = "Stop"

Write-Host "== NitsyClaw OWASP ZAP baseline =="

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker is not available. Install/start Docker, start the dashboard locally, then rerun this command."
}

if ($Target -notmatch '^https?://[a-zA-Z0-9._:-]+(/.*)?$') {
    throw "Target must be a concrete http(s) URL."
}

if ($Report -notmatch '^[a-zA-Z0-9._-]+\.html$') {
    throw "Report must be a simple .html filename."
}

$workspace = (Get-Location).Path
$reportPath = Join-Path $workspace $Report
if (Test-Path $reportPath) {
    Remove-Item $reportPath -Force
}

docker run --rm -t `
    --add-host=host.docker.internal:host-gateway `
    -w /zap/wrk `
    -v "${workspace}:/zap/wrk/:rw" `
    ghcr.io/zaproxy/zaproxy:stable `
    /zap/zap-baseline.py `
    -t $Target `
    -r $Report `
    -I

if ($LASTEXITCODE -ne 0) {
    throw "OWASP ZAP baseline failed for $Target."
}

if (-not (Test-Path $reportPath)) {
    throw "OWASP ZAP baseline passed but did not create $Report in $workspace."
}

Write-Host "OWASP ZAP baseline passed. Report: $Report"
