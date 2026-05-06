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
docker run --rm -t `
    --add-host=host.docker.internal:host-gateway `
    -v "${workspace}:/zap/wrk/:rw" `
    ghcr.io/zaproxy/zaproxy:stable `
    zap-baseline.py `
    -t $Target `
    -r $Report `
    -I

if ($LASTEXITCODE -ne 0) {
    throw "OWASP ZAP baseline failed for $Target."
}

Write-Host "OWASP ZAP baseline passed. Report: $Report"
