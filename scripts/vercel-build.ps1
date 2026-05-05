$ErrorActionPreference = "Stop"

Write-Host "== NitsyClaw Vercel build gate =="

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

if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
    throw "Vercel CLI is not available on PATH."
}

$hasSymlinkPrivilege = Test-WindowsSymlinkPrivilege
if (-not $hasSymlinkPrivilege) {
    Write-Host "Windows symlink privilege is not available. Running Next build to verify app compilation first."
    pnpm --filter @nitsyclaw/dashboard build
    if ($LASTEXITCODE -ne 0) {
        throw "Dashboard Next build failed before Vercel artifact packaging."
    }

    Write-Host @"
Vercel local artifact packaging needs Windows symlink privilege.

Fix one of these before using local prebuilt deploys:
 - Enable Windows Developer Mode, then reopen the terminal.
 - Run this script in an elevated PowerShell session.
 - Run Vercel build from Linux/CI instead.

The dashboard Next build passed; the blocker is local Windows symlink permission.
"@
    exit 1
}

vercel pull --yes --environment preview
if ($LASTEXITCODE -ne 0) {
    throw "vercel pull failed."
}

vercel build --yes
if ($LASTEXITCODE -ne 0) {
    throw "vercel build failed."
}

Write-Host "Vercel build passed."
