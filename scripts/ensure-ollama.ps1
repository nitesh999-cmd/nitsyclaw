# NitsyClaw local Ollama readiness helper.
#
# Ensures the already-installed Ollama server is listening on loopback before
# NitsyClaw needs it, after a reboot or an unexpected exit. Shared by
# launch-bot.ps1 (once, before the bot starts) and broom.ps1 (once per cycle).
#
# Deliberate non-goals: this never installs, updates, pulls, removes or unloads
# a model, never kills or restarts a healthy server, and never binds anything
# to a public or LAN interface. If Ollama cannot be made ready it returns a
# bounded code and the caller carries on - WhatsApp reminders, calendar and
# other non-model work must not depend on the local brain being up.
#
# Exit codes (stable contract, also returned by Invoke-EnsureOllama):
#     0  OK              ready on loopback and the required model is installed
#    10  EXE_NOT_FOUND   no installed ollama executable found
#    11  START_TIMEOUT   started or awaited, but the port never became ready
#    12  MODEL_MISSING   ready, but the required model is not installed
#    13  LOCK_BUSY       another process holds the start lock and it did not
#                        become ready within the bounded wait
#     1  UNEXPECTED      sanitized internal failure
#
# Every seam below is injectable so the behaviour can be tested without a real
# server, a real port or a real executable.

[CmdletBinding()]
param(
    [string]$LogDir = 'C:\Users\Nitesh\projects\NitsyClaw\logs',
    [string]$RequiredModel = 'qwen3:8b',
    [int]$ProbeTimeoutSeconds = 3,
    [int]$StartTimeoutSeconds = 60,
    [int]$LockWaitSeconds = 45,
    [switch]$NoRun
)

$ErrorActionPreference = 'Continue'

# Loopback only. Never widen this to 0.0.0.0, a LAN address or a hostname.
$script:OllamaHostPort = '127.0.0.1:11434'
$script:OllamaBaseUrl = 'http://127.0.0.1:11434'

$script:ExitOk = 0
$script:ExitExeNotFound = 10
$script:ExitStartTimeout = 11
$script:ExitModelMissing = 12
$script:ExitLockBusy = 13
$script:ExitUnexpected = 1

# Only these tokens are ever logged. Raw exception text, environment values and
# process command lines are never written.
function Get-OllamaStatusToken {
    param([int]$Code)
    switch ($Code) {
        0  { 'ok' }
        10 { 'exe_not_found' }
        11 { 'start_timeout' }
        12 { 'model_missing' }
        13 { 'lock_busy' }
        default { 'unexpected' }
    }
}

function Write-OllamaLog {
    param([string]$Token, [string]$Detail = '')
    try {
        if (-not (Test-Path -LiteralPath $LogDir)) {
            New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
        }
        $safeDetail = ''
        if ($Detail) {
            # Bounded, alphanumeric-ish only: no paths, URLs, env values or messages.
            $safeDetail = ' ' + (($Detail -replace '[^A-Za-z0-9_=,\.]', '') )
            if ($safeDetail.Length -gt 80) { $safeDetail = $safeDetail.Substring(0, 80) }
        }
        "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] ensure-ollama: $Token$safeDetail" |
            Out-File -Append "$LogDir\ollama.log"
    } catch {
        # Logging must never change the outcome.
    }
}

# --- injectable seams --------------------------------------------------------

# Readiness probe. Loopback only, bounded, and never throws.
function Test-OllamaReadyDefault {
    try {
        $response = Invoke-WebRequest -Uri "$script:OllamaBaseUrl/api/version" `
            -TimeoutSec $ProbeTimeoutSeconds -UseBasicParsing -ErrorAction Stop
        return ($response.StatusCode -eq 200)
    } catch {
        return $false
    }
}

function Get-OllamaProcessesDefault {
    return @(Get-Process -Name 'ollama' -ErrorAction SilentlyContinue)
}

# Existing Windows install conventions only. Nothing is installed here.
function Resolve-OllamaExecutableDefault {
    $command = Get-Command -Name 'ollama' -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($command -and $command.Source -and (Test-Path -LiteralPath $command.Source)) {
        return $command.Source
    }
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'),
        (Join-Path $env:ProgramFiles 'Ollama\ollama.exe')
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
    }
    return $null
}

# Starts exactly one detached, hidden `ollama serve` bound to loopback.
# OLLAMA_HOST is scoped to the child and the parent value is always restored.
function Start-OllamaServerDefault {
    param([string]$ExecutablePath)
    $hadHost = Test-Path Env:OLLAMA_HOST
    $previousHost = if ($hadHost) { $env:OLLAMA_HOST } else { $null }
    try {
        $env:OLLAMA_HOST = $script:OllamaHostPort
        Start-Process -FilePath $ExecutablePath -ArgumentList 'serve' -WindowStyle Hidden | Out-Null
        return $true
    } catch {
        return $false
    } finally {
        if ($hadHost) { $env:OLLAMA_HOST = $previousHost }
        else { Remove-Item Env:OLLAMA_HOST -ErrorAction SilentlyContinue }
    }
}

# Installed model names. Never pulls; a failure reads as "unknown", not "absent".
function Get-OllamaModelsDefault {
    try {
        $tags = Invoke-RestMethod -Uri "$script:OllamaBaseUrl/api/tags" `
            -TimeoutSec $ProbeTimeoutSeconds -ErrorAction Stop
        return @($tags.models | ForEach-Object { $_.name })
    } catch {
        return @()
    }
}

# --- helpers -----------------------------------------------------------------

function Wait-OllamaReady {
    param([scriptblock]$Probe, [int]$TimeoutSeconds, [scriptblock]$Sleep)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (& $Probe) { return $true }
        & $Sleep
    }
    return (& $Probe)
}

function Write-OllamaHealthMarker {
    param([string]$Model)
    try {
        if (-not (Test-Path -LiteralPath $LogDir)) {
            New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
        }
        "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ready model=$Model" |
            Out-File -Force "$LogDir\ollama-health-last-ok.txt"
    } catch {
        # A missing marker must not turn a healthy result into a failure.
    }
}

# --- main --------------------------------------------------------------------

function Invoke-EnsureOllama {
    [CmdletBinding()]
    param(
        [scriptblock]$Probe = { Test-OllamaReadyDefault },
        [scriptblock]$GetProcesses = { Get-OllamaProcessesDefault },
        [scriptblock]$ResolveExecutable = { Resolve-OllamaExecutableDefault },
        [scriptblock]$StartServer = { param($Path) Start-OllamaServerDefault -ExecutablePath $Path },
        [scriptblock]$GetModels = { Get-OllamaModelsDefault },
        [scriptblock]$Sleep = { Start-Sleep -Milliseconds 500 },
        [string]$LockPath = (Join-Path $env:TEMP 'nitsyclaw-ollama-ensure.lock')
    )

    try {
        # 1. Already ready: return immediately, start nothing, touch nothing.
        if (& $Probe) {
            return Complete-EnsureOllama -Code $script:ExitOk -GetModels $GetModels -Started $false
        }

        # 2. A server process exists but the port is not up yet: wait for that
        #    one instead of starting a second.
        $existing = @(& $GetProcesses)
        if ($existing.Count -gt 0) {
            Write-OllamaLog -Token 'awaiting_existing' -Detail "procs=$($existing.Count)"
            if (Wait-OllamaReady -Probe $Probe -TimeoutSeconds $StartTimeoutSeconds -Sleep $Sleep) {
                return Complete-EnsureOllama -Code $script:ExitOk -GetModels $GetModels -Started $false
            }
            Write-OllamaLog -Token 'start_timeout' -Detail 'awaited_existing'
            return $script:ExitStartTimeout
        }

        # 3. Cross-process lock so a launcher and a Broom tick cannot both start
        #    a server. The loser waits for the winner rather than starting one.
        $lock = $null
        try {
            try {
                $lock = [System.IO.File]::Open($LockPath, 'OpenOrCreate', 'ReadWrite', 'None')
            } catch {
                Write-OllamaLog -Token 'lock_busy' -Detail 'waiting'
                if (Wait-OllamaReady -Probe $Probe -TimeoutSeconds $LockWaitSeconds -Sleep $Sleep) {
                    return Complete-EnsureOllama -Code $script:ExitOk -GetModels $GetModels -Started $false
                }
                return $script:ExitLockBusy
            }

            # Re-probe under the lock: another process may have finished between
            # the first probe and acquiring the lock.
            if (& $Probe) {
                return Complete-EnsureOllama -Code $script:ExitOk -GetModels $GetModels -Started $false
            }

            $exe = & $ResolveExecutable
            if (-not $exe) {
                Write-OllamaLog -Token 'exe_not_found'
                return $script:ExitExeNotFound
            }

            $started = & $StartServer $exe
            if (-not $started) {
                Write-OllamaLog -Token 'start_timeout' -Detail 'spawn_failed'
                return $script:ExitStartTimeout
            }

            if (-not (Wait-OllamaReady -Probe $Probe -TimeoutSeconds $StartTimeoutSeconds -Sleep $Sleep)) {
                Write-OllamaLog -Token 'start_timeout' -Detail 'after_start'
                return $script:ExitStartTimeout
            }

            return Complete-EnsureOllama -Code $script:ExitOk -GetModels $GetModels -Started $true
        } finally {
            if ($lock) { $lock.Dispose() }
        }
    } catch {
        # Never surface the raw exception.
        Write-OllamaLog -Token 'unexpected'
        return $script:ExitUnexpected
    }
}

# Readiness is only "ok" once the required model is confirmed installed.
function Complete-EnsureOllama {
    param([int]$Code, [scriptblock]$GetModels, [bool]$Started)
    if ($Code -ne $script:ExitOk) { return $Code }
    $models = @(& $GetModels)
    if ($models -notcontains $RequiredModel) {
        Write-OllamaLog -Token 'model_missing' -Detail "installed=$($models.Count)"
        return $script:ExitModelMissing
    }
    Write-OllamaHealthMarker -Model $RequiredModel
    Write-OllamaLog -Token 'ok' -Detail $(if ($Started) { 'started' } else { 'already_running' })
    return $script:ExitOk
}

if (-not $NoRun -and $MyInvocation.InvocationName -ne '.') {
    $code = Invoke-EnsureOllama
    exit $code
}
