param(
    [string]$ProjectId = $(if ($env:RAILWAY_PROJECT_ID) { $env:RAILWAY_PROJECT_ID } else { "14a48d9f-310a-446f-9350-77a28ebdc239" }),
    [string]$Environment = $(if ($env:RAILWAY_ENVIRONMENT) { $env:RAILWAY_ENVIRONMENT } else { "production" }),
    [string]$Service = $(if ($env:RAILWAY_SERVICE) { $env:RAILWAY_SERVICE } else { "web" }),
    [string]$BaseUrl = $(if ($env:NITSYCLAW_RAILWAY_PUBLIC_URL) { $env:NITSYCLAW_RAILWAY_PUBLIC_URL } else { "https://web-production-c98e2.up.railway.app" }),
    [string]$ExpectedCommit = $(git rev-parse --short HEAD),
    [switch]$AllowServingCommit
)

# NitsyClaw Railway readiness gate.
#
# WHAT THIS GATE ASSERTS, AND WHY IT CHANGED
#
# The laptop owns the WhatsApp session; Railway deliberately runs in no-client mode.
# The previous version of this gate waited for "[wwebjs] client ready" and
# "[boot] WhatsApp ready" in the Railway deployment logs. Under laptop ownership those
# lines are never emitted, so the gate could not pass however healthy the deployment was.
# It encoded the retired Railway-owns-WhatsApp model.
#
# This version asserts the invariant that is actually correct after the cutover:
#   * the latest deployment is SUCCESS, has a RUNNING instance, and is the expected commit
#   * GET /healthz              -> 200, body "ok"
#   * GET /health               -> status=ok, whatsapp.ready=false, reason=runtime_not_owner
#   * GET /recovery/whatsapp-qr -> 404  (no pairing surface exposed in no-client mode)
#
# A Railway service that starts answering /recovery/whatsapp-qr, or that reports
# whatsapp.ready=true, has taken the session away from the laptop. That is the regression
# this gate exists to catch.
#
# JSON PARSING
#
# The previous version piped `pnpm dlx @railway/cli status --json` — merged with stderr via
# 2>&1 — straight into ConvertFrom-Json. On a cold dlx cache pnpm prints installer progress
# ("Progress: resolved 1, ...") to stdout first, so ConvertFrom-Json failed on the leading
# "P". The gate therefore passed or failed depending on whether a package cache happened to
# be warm. Invoke-RailwayJson below keeps stderr out of the parsed stream entirely, prefers
# a real `railway` binary when one is on PATH, pre-warms dlx otherwise, and slices from the
# first JSON delimiter as a defensive backstop.

$ErrorActionPreference = "Stop"

$script:RailwayExe = $null
$script:RailwayPrefix = @()

function Resolve-RailwayCli {
    if ($script:RailwayExe) { return }

    $onPath = Get-Command railway -ErrorAction SilentlyContinue
    if ($onPath) {
        $script:RailwayExe = $onPath.Source
        $script:RailwayPrefix = @()
        return
    }

    # Fall back to pnpm dlx. Pre-warm it so any install chatter is emitted — and discarded —
    # before a call whose stdout we intend to parse.
    & pnpm dlx @railway/cli --version *> $null
    $script:RailwayExe = "pnpm"
    $script:RailwayPrefix = @("dlx", "@railway/cli")
}

function Get-ScopeArgs {
    return @(
        "--project", $ProjectId,
        "--environment", $Environment,
        "--service", $Service
    )
}

function Invoke-RailwayJson {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string[]]$RailwayArgs
    )

    Resolve-RailwayCli
    $all = @($script:RailwayPrefix + $RailwayArgs)
    Write-Host ("railway " + ($RailwayArgs -join " "))

    $errPath = [System.IO.Path]::GetTempFileName()
    try {
        # stdout is captured; stderr goes to a file so it can never contaminate the JSON.
        $stdout = & $script:RailwayExe @all 2> $errPath
        $exit = $LASTEXITCODE
        if ($exit -ne 0) {
            $stderrText = (Get-Content -LiteralPath $errPath -Raw -ErrorAction SilentlyContinue)
            throw "$Label failed with exit code ${exit}: $stderrText"
        }
    }
    finally {
        Remove-Item -LiteralPath $errPath -Force -ErrorAction SilentlyContinue
    }

    $text = ($stdout -join "`n")
    $objectStart = $text.IndexOf("{")
    $arrayStart = $text.IndexOf("[")
    $start = if ($objectStart -lt 0) { $arrayStart }
             elseif ($arrayStart -lt 0) { $objectStart }
             else { [Math]::Min($objectStart, $arrayStart) }
    if ($start -lt 0) {
        throw "$Label returned no JSON payload."
    }

    return ($text.Substring($start) | ConvertFrom-Json)
}

function Normalize-BaseUrl {
    param([Parameter(Mandatory = $true)][string]$Url)
    $trimmed = $Url.Trim().TrimEnd("/")
    if ($trimmed -notmatch '^https://[a-z0-9.-]+$') {
        throw "BaseUrl must be a concrete https:// hostname."
    }
    return $trimmed
}

function Get-StatusCode {
    param([Parameter(Mandatory = $true)][string]$Uri)
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 20
        return [int]$response.StatusCode
    }
    catch {
        $r = $_.Exception.Response
        if ($r -and $r.StatusCode) { return [int]$r.StatusCode }
        throw
    }
}

Write-Host "== NitsyClaw Railway readiness gate (no-client mode) =="
Write-Host "Project: $ProjectId"
Write-Host "Environment: $Environment"
Write-Host "Service: $Service"
Write-Host "Expected commit: $ExpectedCommit"

# --- deployment -------------------------------------------------------------------------

$status = Invoke-RailwayJson -Label "Railway status" -RailwayArgs (@("status", "--json") + (Get-ScopeArgs))

$serviceNode = $status.environments.edges.node.serviceInstances.edges.node |
    Where-Object { $_.serviceName -eq $Service } |
    Select-Object -First 1
if (-not $serviceNode) {
    throw "Railway service '$Service' was not found in status output."
}

$deployment = $serviceNode.latestDeployment
if (-not $deployment) {
    throw "Railway service '$Service' has no latest deployment."
}

$deploymentId = [string]$deployment.id
$deploymentStatus = [string]$deployment.status
$deploymentCommit = [string]$deployment.meta.commitHash
$runningInstances = @($deployment.instances | Where-Object { $_.status -eq "RUNNING" })

if ($deploymentStatus -ne "SUCCESS") {
    throw "Latest Railway deployment $deploymentId is '$deploymentStatus', not SUCCESS."
}
if ($runningInstances.Count -lt 1) {
    throw "Latest Railway deployment $deploymentId has no RUNNING instance."
}

$commitToVerify = $ExpectedCommit
$commitMatches = $commitToVerify -and $deploymentCommit.StartsWith($commitToVerify)
if ($commitToVerify -and -not $commitMatches -and $AllowServingCommit) {
    if ([string]::IsNullOrWhiteSpace($deploymentCommit)) {
        throw "AllowServingCommit was requested, but deployment $deploymentId has no commit metadata."
    }
    $commitToVerify = $deploymentCommit.Substring(0, [Math]::Min(7, $deploymentCommit.Length))
    $commitMatches = $true
    Write-Host "Expected commit $ExpectedCommit is not deployed; proving serving commit $commitToVerify instead."
}
if ($ExpectedCommit -and -not $commitMatches) {
    throw "Latest Railway deployment $deploymentId is commit $deploymentCommit, expected $ExpectedCommit."
}

# --- HTTP surface -----------------------------------------------------------------------

$root = Normalize-BaseUrl -Url $BaseUrl

$healthz = Invoke-WebRequest -UseBasicParsing "$root/healthz" -TimeoutSec 20
if ([int]$healthz.StatusCode -ne 200) {
    throw "$root/healthz returned HTTP $($healthz.StatusCode), expected 200."
}
if ([string]$healthz.Content -ne "ok") {
    throw "$root/healthz returned '$($healthz.Content)', expected 'ok'."
}

$healthRaw = Invoke-WebRequest -UseBasicParsing "$root/health" -TimeoutSec 20
$health = $healthRaw.Content | ConvertFrom-Json

if ([string]$health.status -ne "ok") {
    throw "$root/health reported status '$($health.status)', expected 'ok'."
}
if ($health.whatsapp.ready -ne $false) {
    throw "$root/health reported whatsapp.ready=$($health.whatsapp.ready), expected false. Railway must not hold the WhatsApp session; the laptop owns it."
}
if ([string]$health.whatsapp.reason -ne "runtime_not_owner") {
    throw "$root/health reported reason '$($health.whatsapp.reason)', expected 'runtime_not_owner'."
}

$qrCode = Get-StatusCode -Uri "$root/recovery/whatsapp-qr"
if ($qrCode -ne 404) {
    throw "$root/recovery/whatsapp-qr returned HTTP $qrCode, expected 404. A reachable pairing surface means Railway is running a WhatsApp client."
}

Write-Host "Railway readiness gate passed (no-client mode)."
Write-Host "Deployment: $deploymentId ($deploymentStatus, commit $commitToVerify)"
Write-Host "Health: /healthz 200 ok; /health runtime_not_owner; /recovery/whatsapp-qr 404"
