param(
    [string]$ProjectId = $(if ($env:RAILWAY_PROJECT_ID) { $env:RAILWAY_PROJECT_ID } else { "14a48d9f-310a-446f-9350-77a28ebdc239" }),
    [string]$Environment = $(if ($env:RAILWAY_ENVIRONMENT) { $env:RAILWAY_ENVIRONMENT } else { "production" }),
    [string]$Service = $(if ($env:RAILWAY_SERVICE) { $env:RAILWAY_SERVICE } else { "web" }),
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
Write-Host "Project: $ProjectId"
Write-Host "Environment: $Environment"
Write-Host "Service: $Service"
Write-Host "Expected commit: $ExpectedCommit"
Write-Host "Timeout: $TimeoutSeconds seconds"

while ((Get-Date) -lt $deadline) {
    $rawDeploymentList = pnpm --silent dlx @railway/cli deployment list `
        --environment $Environment `
        --service $Service `
        --limit 10 `
        --json 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host ([string]::Join("`n", @($rawDeploymentList)))
        throw "Railway deployment list failed."
    }

    $deploymentListText = [string]::Join("`n", @($rawDeploymentList))
    $parsedDeployments = $deploymentListText | ConvertFrom-Json
    $deployments = if ($parsedDeployments -is [System.Array]) { $parsedDeployments } else { @($parsedDeployments) }
    $latest = @($deployments)[0]
    if (-not $latest) {
        throw "Railway returned no deployments."
    }

    $commit = [string]$latest.meta.commitHash
    $status = [string]$latest.status
    $id = [string]$latest.id
    $message = [string]$latest.meta.commitMessage
    if ([string]::IsNullOrWhiteSpace($message)) {
        $message = [string]$latest.meta.cliMessage
    }
    $commitMatches = $ExpectedCommit -and $commit.StartsWith($ExpectedCommit)
    $messageMatches = $ExpectedCommit -and [string]::IsNullOrWhiteSpace($commit) -and $message -match [regex]::Escape($ExpectedCommit)
    $commitLabel = if ($commit.Length -gt 0) { $commit.Substring(0, [Math]::Min(7, $commit.Length)) } else { "no-commit" }

    Write-Host "$((Get-Date).ToString("HH:mm:ss")) $status $id $commitLabel $message"

    if ($commitMatches -or $messageMatches) {
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
