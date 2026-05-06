$ErrorActionPreference = "Stop"

Write-Host "== NitsyClaw Semgrep security scan =="

if (-not (Get-Command semgrep -ErrorAction SilentlyContinue)) {
    throw "Semgrep CLI is not available on PATH. Install it with: python -m pip install semgrep"
}

$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

semgrep scan --config auto --error
if ($LASTEXITCODE -ne 0) {
    throw "Semgrep security scan failed."
}

Write-Host "Semgrep security scan passed."
