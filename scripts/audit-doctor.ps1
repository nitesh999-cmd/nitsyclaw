param(
    [string]$BaseUrl = "https://nitsyclaw.vercel.app"
)

$ErrorActionPreference = "Stop"

Write-Host "== NitsyClaw audit doctor =="

$failures = New-Object System.Collections.Generic.List[string]

function Add-Failure {
    param([Parameter(Mandatory = $true)][string]$Message)
    $script:failures.Add($Message) | Out-Null
    Write-Host "FAIL $Message"
}

function Add-Pass {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host "OK   $Message"
}

function Test-WindowsSymlinkPrivilege {
    $isWindowsOs = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
        [System.Runtime.InteropServices.OSPlatform]::Windows
    )
    if (-not $isWindowsOs) {
        return $true
    }

    $root = Join-Path ([System.IO.Path]::GetTempPath()) ("nitsyclaw-symlink-check-" + [System.Guid]::NewGuid().ToString("N"))
    $target = Join-Path $root "target"
    $link = Join-Path $root "link"
    New-Item -ItemType Directory -Path $root | Out-Null
    try {
        New-Item -ItemType Directory -Path $target | Out-Null
        New-Item -ItemType SymbolicLink -Path $link -Target $target | Out-Null
        return $true
    } catch {
        return $false
    } finally {
        if (Test-Path -LiteralPath $root) {
            Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

if (Get-Command docker -ErrorAction SilentlyContinue) {
    try {
        docker info | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Add-Pass "Docker is available for OWASP ZAP baseline."
        } else {
            Add-Failure "Docker CLI exists but Docker Engine is not responding. Start Docker Desktop, then rerun pnpm run audit:doctor."
        }
    } catch {
        Add-Failure "Docker CLI exists but Docker Engine is not responding. Start Docker Desktop, then rerun pnpm run audit:doctor."
    }
} else {
    Add-Failure "Docker is missing. Install/start Docker before pnpm run security:zap."
}

if (Get-Command vercel -ErrorAction SilentlyContinue) {
    Add-Pass "Vercel CLI is available."
} else {
    Add-Failure "Vercel CLI is missing from PATH. Install it or run Vercel packaging in CI."
}

if (Test-WindowsSymlinkPrivilege) {
    Add-Pass "Symlink privilege is available for local Vercel artifact packaging."
} else {
    Add-Failure "Windows symlink privilege is unavailable. Enable Developer Mode, reopen terminal, or run Vercel build in CI/Linux."
}

if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
    Add-Pass "curl.exe is available for live smoke checks."
} else {
    Add-Failure "curl.exe is missing from PATH; pnpm run release:live-smoke cannot run."
}

if ($BaseUrl -notmatch '^https://[a-z0-9.-]+$') {
    Add-Failure "BaseUrl must be a concrete https:// hostname."
} else {
    try {
        $health = & curl.exe -sS -m 20 "$BaseUrl/api/healthz"
        if ($LASTEXITCODE -eq 0 -and (($health -join "`n") -match '"ok"\s*:\s*true')) {
            Add-Pass "Live health endpoint is reachable at $BaseUrl/api/healthz."
        } else {
            Add-Failure "Live health endpoint did not return ok=true at $BaseUrl/api/healthz."
        }
    } catch {
        Add-Failure "Live health endpoint is not reachable at $BaseUrl/api/healthz."
    }
}

if ($failures.Count -gt 0) {
    Write-Host ""
    Write-Host "Audit doctor found $($failures.Count) blocker(s)."
    exit 1
}

Write-Host "Audit doctor passed."
