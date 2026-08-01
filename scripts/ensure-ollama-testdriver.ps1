# Deterministic test driver for scripts/ensure-ollama.ps1.
#
# Dot-sources the helper with -NoRun and injects fake seams so behaviour can be
# proved without a real Ollama server, a real port, a real process or a real
# executable. Emits a single JSON line for the calling test to assert on.
#
# Cross-process state (start counts, probe readiness) lives in files under
# -StateDir so the concurrency scenario can run two real processes against one
# lock. This script is test-only and never contacts the network.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Scenario,
    [Parameter(Mandatory = $true)][string]$StateDir,
    [int]$StartTimeoutSeconds = 2,
    [int]$LockWaitSeconds = 2
)

$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

$startFile = Join-Path $StateDir 'starts.txt'
$readyFile = Join-Path $StateDir 'ready.txt'
$hostFile = Join-Path $StateDir 'childhost.txt'
$lockPath = Join-Path $StateDir 'ensure.lock'
$logDir = Join-Path $StateDir 'logs'

function Add-Start {
    # Append-only so concurrent processes cannot lose a count.
    Add-Content -LiteralPath $startFile -Value 'start'
}
function Get-StartCount {
    if (-not (Test-Path -LiteralPath $startFile)) { return 0 }
    return @(Get-Content -LiteralPath $startFile | Where-Object { $_ -eq 'start' }).Count
}

$helper = Join-Path $PSScriptRoot 'ensure-ollama.ps1'
. $helper -NoRun -LogDir $logDir -RequiredModel 'qwen3:8b' `
    -StartTimeoutSeconds $StartTimeoutSeconds -LockWaitSeconds $LockWaitSeconds

# --- fake seams --------------------------------------------------------------

$probeHealthy = { $true }
$probeNeverReady = { $false }
$probeReadyAfterStart = { Test-Path -LiteralPath $readyFile }

$processesNone = { @() }
$processesOne = { @([pscustomobject]@{ Id = 4242 }) }

$resolveExe = { 'C:\fake\ollama.exe' }
$resolveExeMissing = { $null }

# Records the start, the loopback host the child would receive, and flips the
# fake port to ready. Mirrors the real starter's env scoping and restoration.
$startServer = {
    param($Path)
    Add-Start
    $hadHost = Test-Path Env:OLLAMA_HOST
    $previousHost = if ($hadHost) { $env:OLLAMA_HOST } else { $null }
    try {
        $env:OLLAMA_HOST = $script:OllamaHostPort
        Set-Content -LiteralPath $hostFile -Value $env:OLLAMA_HOST
        Set-Content -LiteralPath $readyFile -Value 'ready'
        return $true
    } finally {
        if ($hadHost) { $env:OLLAMA_HOST = $previousHost }
        else { Remove-Item Env:OLLAMA_HOST -ErrorAction SilentlyContinue }
    }
}
$startServerFails = { param($Path) Add-Start; return $false }

$modelsPresent = { @('qwen3:8b', 'nomic-embed-text:latest') }
$modelsMissing = { @('nomic-embed-text:latest') }
$noSleep = { Start-Sleep -Milliseconds 20 }

# A sentinel the parent environment must still hold afterwards.
$env:OLLAMA_HOST = 'PARENT-SENTINEL'

$common = @{
    GetProcesses = $processesNone
    ResolveExecutable = $resolveExe
    StartServer = $startServer
    GetModels = $modelsPresent
    Sleep = $noSleep
    LockPath = $lockPath
}

# Build one splat per scenario. Overriding a splatted key with an explicit
# parameter is a duplicate-parameter error in PowerShell, so every difference is
# applied by mutating a clone instead.
$callArgs = $common.Clone()
switch ($Scenario) {
    'healthy'            { $callArgs.Probe = $probeHealthy }
    'missing'            { $callArgs.Probe = $probeReadyAfterStart }
    'concurrent'         { $callArgs.Probe = $probeReadyAfterStart }
    'existing-starting'  {
        # A server process exists but the port is still coming up: the first
        # probe must fail, so the helper takes the awaiting-existing branch
        # rather than short-circuiting on an already-ready port.
        $probeCountFile = Join-Path $StateDir 'probes.txt'
        $callArgs.Probe = {
            Add-Content -LiteralPath $probeCountFile -Value 'p'
            return (@(Get-Content -LiteralPath $probeCountFile).Count -ge 3)
        }.GetNewClosure()
        $callArgs.GetProcesses = $processesOne
        # Any invocation here means the helper wrongly started a second server.
        $callArgs.StartServer = { param($Path) Add-Start; return $true }
    }
    'start-timeout'      { $callArgs.Probe = $probeNeverReady; $callArgs.StartServer = $startServerFails }
    'never-ready'        { $callArgs.Probe = $probeNeverReady }
    'exe-missing'        { $callArgs.Probe = $probeNeverReady; $callArgs.ResolveExecutable = $resolveExeMissing }
    'model-missing'      { $callArgs.Probe = $probeHealthy; $callArgs.GetModels = $modelsMissing }
    default              { throw "unknown scenario: $Scenario" }
}
$code = Invoke-EnsureOllama @callArgs

# For 'existing-starting' the fake process is present, so a real start must not
# have happened; the driver's own starter is only wired to prove that.
$logText = ''
$logFile = Join-Path $logDir 'ollama.log'
if (Test-Path -LiteralPath $logFile) { $logText = (Get-Content -LiteralPath $logFile -Raw) }

$result = [ordered]@{
    scenario = $Scenario
    code = [int]$code
    starts = Get-StartCount
    childHost = $(if (Test-Path -LiteralPath $hostFile) { Get-Content -LiteralPath $hostFile -Raw } else { '' }).Trim()
    parentHostAfter = $(if (Test-Path Env:OLLAMA_HOST) { $env:OLLAMA_HOST } else { '<removed>' })
    healthMarker = (Test-Path -LiteralPath (Join-Path $logDir 'ollama-health-last-ok.txt'))
    log = $logText.Trim()
}
$result | ConvertTo-Json -Compress
