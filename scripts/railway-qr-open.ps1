param(
    [string]$ProjectId = $(if ($env:RAILWAY_PROJECT_ID) { $env:RAILWAY_PROJECT_ID } else { "14a48d9f-310a-446f-9350-77a28ebdc239" }),
    [string]$Environment = $(if ($env:RAILWAY_ENVIRONMENT) { $env:RAILWAY_ENVIRONMENT } else { "production" }),
    [string]$Service = $(if ($env:RAILWAY_SERVICE) { $env:RAILWAY_SERVICE } else { "web" }),
    [string]$PublicBaseUrl = $(if ($env:NITSYCLAW_RAILWAY_PUBLIC_URL) { $env:NITSYCLAW_RAILWAY_PUBLIC_URL } else { "https://web-production-c98e2.up.railway.app" }),
    [int]$Minutes = 60,
    [int]$TimeoutSeconds = 900,
    [int]$PollSeconds = 15
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$env:CI = "1"
$env:PNPM_CONFIG_LOGLEVEL = "error"
$pnpmExe = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
$pnpmCommand = if ($pnpmExe) { $pnpmExe.Source } else { "pnpm" }

function Invoke-RailwayCli {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CliArgs)
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $pnpmCommand dlx @railway/cli @CliArgs 2>&1
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

if ($Minutes -lt 1 -or $Minutes -gt 120) {
    throw "Minutes must be between 1 and 120."
}
if ($TimeoutSeconds -lt 60) {
    throw "TimeoutSeconds must be at least 60."
}
if ($PollSeconds -lt 5) {
    throw "PollSeconds must be at least 5."
}

$base = $PublicBaseUrl.TrimEnd("/")
$url = "$base/recovery/whatsapp-qr"
$svgUrl = "$url.svg"

function Get-WhatsAppHealth {
    param([Parameter(Mandatory = $true)][string]$BaseUrl)

    try {
        $response = Invoke-WebRequest -UseBasicParsing "$BaseUrl/health" -TimeoutSec 20
        return ([string]$response.Content | ConvertFrom-Json)
    } catch {
        return $null
    }
}

$currentHealth = Get-WhatsAppHealth -BaseUrl $base
if ($currentHealth -and $currentHealth.whatsapp -and $currentHealth.whatsapp.ready -eq $true) {
    Write-Host "WhatsApp is already ready on Railway. QR recovery is not needed."
    Write-Host "Run: pnpm run railway:whatsapp-ready -- -ExpectedCommit $($currentHealth.runtime.commitShort)"
    exit 0
}

$tokenBytes = [byte[]]::new(32)
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $rng.GetBytes($tokenBytes)
}
finally {
    $rng.Dispose()
}
$token = [Convert]::ToBase64String($tokenBytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
$untilDate = (Get-Date).ToUniversalTime().AddMinutes($Minutes)
$until = $untilDate.ToString("o")
$untilLocal = $untilDate.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss zzz")

Write-Host "Opening a short WhatsApp QR recovery window for $Minutes minute(s)."
Write-Host "Recovery window expires at $untilLocal (local) / $until UTC."
Write-Host "No QR payload will be written to Railway logs."

function Get-RailwayVariablesJson {
    $raw = Invoke-RailwayCli variable list --project $ProjectId --environment $Environment --service $Service --json
    return ($raw -join "`n")
}

function Test-VariablePresent {
    param(
        [Parameter(Mandatory = $true)][string]$RawJson,
        [Parameter(Mandatory = $true)][string]$Name
    )
    return $RawJson -match ('"' + [regex]::Escape($Name) + '"')
}

function Remove-RailwayVariableIfPresent {
    param([Parameter(Mandatory = $true)][string]$Name)
    $variables = Get-RailwayVariablesJson
    if ($LASTEXITCODE -ne 0) { throw "Failed to list Railway variables before removing $Name." }
    if (-not (Test-VariablePresent -RawJson $variables -Name $Name)) { return }
    Invoke-RailwayCli variable delete $Name --project $ProjectId --environment $Environment --service $Service --json | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to remove Railway variable $Name." }
}

function Get-LatestDeployment {
    $raw = Invoke-RailwayCli status --json
    if ($LASTEXITCODE -ne 0) { throw "Failed to read Railway status." }
    $status = ($raw -join "`n") | ConvertFrom-Json
    $serviceNode = $status.environments.edges.node.serviceInstances.edges.node |
        Where-Object { $_.serviceName -eq $Service } |
        Select-Object -First 1
    if (-not $serviceNode) {
        throw "Railway service '$Service' was not found."
    }
    if (-not $serviceNode.latestDeployment) {
        throw "Railway service '$Service' has no latest deployment."
    }
    return $serviceNode.latestDeployment
}

function Test-EndpointOk {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [hashtable]$Headers = @{}
    )

    try {
        return Invoke-WebRequest -UseBasicParsing $Url -Headers $Headers -TimeoutSec 20
    } catch {
        return $null
    }
}

Remove-RailwayVariableIfPresent -Name "NITSYCLAW_PRINT_QR_TO_LOGS"

Invoke-RailwayCli variable set "NITSYCLAW_QR_RECOVERY_TOKEN=$token" --project $ProjectId --environment $Environment --service $Service --skip-deploys --json | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Failed to set NITSYCLAW_QR_RECOVERY_TOKEN." }

Invoke-RailwayCli variable set "NITSYCLAW_QR_RECOVERY_UNTIL=$until" --project $ProjectId --environment $Environment --service $Service --json | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Failed to set NITSYCLAW_QR_RECOVERY_UNTIL." }

$afterSetVariables = Get-RailwayVariablesJson
if ($LASTEXITCODE -ne 0) { throw "Failed to verify Railway variables." }
if (Test-VariablePresent -RawJson $afterSetVariables -Name "NITSYCLAW_PRINT_QR_TO_LOGS") {
    throw "Unsafe legacy variable is still present: NITSYCLAW_PRINT_QR_TO_LOGS."
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)

Write-Host ""
Write-Host "Railway deployment was triggered so the running app receives the new token."
Write-Host "Wait until Railway is healthy and verified before scanning."
Write-Host "Waiting for Railway health and verified QR before printing operator instructions."

do {
    $latest = Get-LatestDeployment
    $deploymentId = [string]$latest.id
    $deploymentStatus = [string]$latest.status
    Write-Host "$((Get-Date).ToString("HH:mm:ss")) $deploymentStatus $deploymentId"

    if ($deploymentStatus -in @("CRASHED", "FAILED", "REMOVED")) {
        throw "Railway deployment $deploymentId ended as $deploymentStatus."
    }

    if ($deploymentStatus -eq "SUCCESS") {
        $health = Test-EndpointOk -Url "$base/healthz"
        $qr = Test-EndpointOk -Url $svgUrl -Headers @{ "X-NitsyClaw-Recovery-Token" = $token }
        if (
            $health -and
            [string]$health.Content -eq "ok" -and
            $qr -and
            [int]$qr.StatusCode -eq 200 -and
            ([string]$qr.Content) -match "<svg"
        ) {
            Write-Host "Railway health verified: $base/healthz ok"
            Write-Host "QR endpoint verified: $svgUrl returned SVG"
            Write-Host ""
            Write-Host "Open this URL on your PC:"
            Write-Host $url
            Write-Host ""
            Write-Host "Paste this recovery token into the page. It is not part of the URL:"
            Write-Host $token
            Write-Host ""
            Write-Host "Then scan it from WhatsApp > Linked devices."
            Write-Host ""
            Write-Host "After scan, do not close QR recovery manually."
            Write-Host "First run: pnpm run railway:whatsapp-ready -- -ExpectedCommit <deployed-commit>"
            Write-Host "Only close recovery after WhatsApp ready proof passes."
            exit 0
        }

        Write-Host "Railway is up, but QR is not verified yet; retrying."
    }

    Start-Sleep -Seconds $PollSeconds
} while ((Get-Date) -lt $deadline)

throw "Timed out before Railway served a verified WhatsApp QR."
