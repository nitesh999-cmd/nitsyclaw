param(
    [string]$ExpectedCommit = $(git rev-parse --short HEAD),
    [int]$TimeoutSeconds = 900,
    [int]$PollSeconds = 30
)

$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -ge 7) {
    $PSNativeCommandUseErrorActionPreference = $false
}

if (-not $ExpectedCommit) {
    throw "ExpectedCommit is required."
}
if ($TimeoutSeconds -lt 60) {
    throw "TimeoutSeconds must be at least 60."
}
if ($PollSeconds -lt 5) {
    throw "PollSeconds must be at least 5."
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)

Write-Host "== Railway deploy wait =="
Write-Host "Expected commit: $ExpectedCommit"
Write-Host "Timeout: $TimeoutSeconds seconds"

while ((Get-Date) -lt $deadline) {
    $json = pnpm dlx @railway/cli deployment list --json 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host ($json -join "`n")
        throw "Railway deployment list failed."
    }

    $deployments = $json | ConvertFrom-Json
    $latest = @($deployments)[0]
    if (-not $latest) {
        throw "Railway returned no deployments."
    }

    $commit = [string]$latest.meta.commitHash
    $status = [string]$latest.status
    $id = [string]$latest.id
    $message = [string]$latest.meta.commitMessage

    Write-Host "$((Get-Date).ToString("HH:mm:ss")) $status $id $($commit.Substring(0, [Math]::Min(7, $commit.Length))) $message"

    if ($commit.StartsWith($ExpectedCommit)) {
        if ($status -eq "SUCCESS") {
            Write-Host "Railway deployment succeeded: $id"
            exit 0
        }
        if ($status -in @("CRASHED", "FAILED", "REMOVED")) {
            throw "Railway deployment $id ended as $status."
        }
    }

    Start-Sleep -Seconds $PollSeconds
}

throw "Timed out waiting for Railway deployment for commit $ExpectedCommit."
