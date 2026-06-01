param(
    [string]$Owner = "nitesh999-cmd",
    [string]$Repo = "nitsyclaw"
)

$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -ge 7) {
    $PSNativeCommandUseErrorActionPreference = $false
}

$failures = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

function Add-Failure {
    param([Parameter(Mandatory = $true)][string]$Message)
    $failures.Add($Message) | Out-Null
    Write-Host "FAIL $Message"
}

function Add-Warning {
    param([Parameter(Mandatory = $true)][string]$Message)
    $warnings.Add($Message) | Out-Null
    Write-Host "WARN $Message"
}

function Test-CommandExists {
    param([Parameter(Mandatory = $true)][string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-GitHubSecretNames {
    param([Parameter(Mandatory = $true)][string]$Repository)

    $raw = & gh secret list --repo $Repository 2>&1
    $text = [string]::Join("`n", @($raw))
    if ($LASTEXITCODE -ne 0) {
        throw "gh secret list failed: $text"
    }

    $names = New-Object System.Collections.Generic.HashSet[string]
    foreach ($line in ($text -split "`r?`n")) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed)) {
            continue
        }
        $name = ($trimmed -split "\s+")[0]
        if (-not [string]::IsNullOrWhiteSpace($name)) {
            $names.Add($name) | Out-Null
        }
    }
    return ,$names
}

Write-Host "== NitsyClaw release secrets doctor =="
Write-Host "Repository: $Owner/$Repo"
Write-Host "No secret values are printed."

if (-not (Test-CommandExists -Name "gh")) {
    Add-Failure "GitHub CLI is missing. Install/authenticate gh before checking repository secrets."
}

if ($failures.Count -eq 0) {
    $authOutput = & gh auth status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Add-Failure "GitHub CLI is not authenticated. Run gh auth login, then rerun this doctor."
    }
}

if ($failures.Count -eq 0) {
    $repository = "$Owner/$Repo"
    $secretNames = Get-GitHubSecretNames -Repository $repository

    if (-not $secretNames.Contains("RAILWAY_TOKEN")) {
        Add-Failure "Missing GitHub secret RAILWAY_TOKEN. Worker/Railway changes cannot run live WhatsApp proof in CI."
    } else {
        Write-Host "OK RAILWAY_TOKEN secret is configured."
    }

    $vercelSecrets = @("VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID")
    $missingVercel = @($vercelSecrets | Where-Object { -not $secretNames.Contains($_) })
    if ($missingVercel.Count -gt 0) {
        Add-Warning ("Missing Vercel packaging secret(s): " + ($missingVercel -join ", ") + ". CI can still pass, but Vercel packaging proof will be skipped.")
    } else {
        Write-Host "OK Vercel packaging secrets are configured."
    }
}

if ($failures.Count -gt 0) {
    Write-Host ""
    Write-Host "Required manual action:"
    Write-Host "1. Create or copy a scoped Railway project/API token in Railway."
    Write-Host "2. Save it as a GitHub Actions repository secret without printing it:"
    Write-Host "   gh secret set RAILWAY_TOKEN --repo $Owner/$Repo"
    Write-Host "3. Rerun this doctor:"
    Write-Host "   pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/release-secrets-doctor.ps1"
    Write-Host ""
    throw "Release secrets doctor found $($failures.Count) blocker(s)."
}

if ($warnings.Count -gt 0) {
    Write-Host "Release secrets doctor passed with $($warnings.Count) warning(s)."
    exit 0
}

Write-Host "Release secrets doctor passed."
