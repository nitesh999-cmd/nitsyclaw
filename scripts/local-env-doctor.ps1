$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -ge 7) {
    $PSNativeCommandUseErrorActionPreference = $false
}

$envFiles = @(
    ".env.local",
    "apps/dashboard/.env.local",
    "apps/bot/.env.local",
    ".env"
)

$critical = @(
    "DATABASE_URL",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "ENCRYPTION_KEY",
    "WHATSAPP_OWNER_NUMBER",
    "TIMEZONE"
)

$optionalButExpected = @(
    "NITSYCLAW_DASHBOARD_USER",
    "NITSYCLAW_DASHBOARD_PASSWORD",
    "NITSYCLAW_SECRET_ROOT",
    "WHATSAPP_SESSION_DIR",
    "NTFY_TOPIC",
    ("GITHUB" + "_PAT"),
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    "MS_CLIENT_ID",
    "MS_TENANT_ID"
)

function Read-EnvNames {
    param([Parameter(Mandatory = $true)][string[]]$Files)

    $values = @{}
    foreach ($file in $Files) {
        if (-not (Test-Path -LiteralPath $file)) {
            continue
        }

        foreach ($line in Get-Content -LiteralPath $file) {
            if ($line -notmatch "^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$") {
                continue
            }

            $name = $Matches[1]
            $value = $Matches[2].Trim()
            if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
                $value = $value.Substring(1, $value.Length - 2)
            }

            if (-not $values.ContainsKey($name)) {
                $values[$name] = $value
            }
        }
    }

    return $values
}

Write-Host "== NitsyClaw local env doctor =="
Write-Host "No secret values are printed."

$existingFiles = @($envFiles | Where-Object { Test-Path -LiteralPath $_ })
if ($existingFiles.Count -eq 0) {
    throw "No local env file found. Restore .env.local or use the external secret root before restarting the bot locally."
}

Write-Host ("env_files=" + ($existingFiles -join ", "))
$envValues = Read-EnvNames -Files $envFiles
Write-Host "env_key_count=$($envValues.Keys.Count)"

$missingCritical = New-Object System.Collections.Generic.List[string]
foreach ($name in $critical) {
    if (-not $envValues.ContainsKey($name) -or [string]::IsNullOrWhiteSpace([string]$envValues[$name])) {
        $missingCritical.Add($name) | Out-Null
    }
}

$missingOptional = @($optionalButExpected | Where-Object {
    -not $envValues.ContainsKey($_) -or [string]::IsNullOrWhiteSpace([string]$envValues[$_])
})

if ($missingOptional.Count -gt 0) {
    Write-Host ("WARN optional_or_provider_keys_missing=" + ($missingOptional -join ", "))
}

if ($missingCritical.Count -gt 0) {
    Write-Host ("FAIL critical_keys_missing=" + ($missingCritical -join ", "))
    Write-Host ""
    Write-Host "Restore these from your password manager or provider dashboards before restarting the local bot."
    Write-Host "Do not paste secret values into chat."
    throw "Local env doctor found $($missingCritical.Count) critical missing key(s)."
}

Write-Host "Local env doctor passed."
