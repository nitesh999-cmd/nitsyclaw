param(
    [string]$Owner = $(if ($env:GITHUB_REPOSITORY -and $env:GITHUB_REPOSITORY.Contains("/")) { $env:GITHUB_REPOSITORY.Split("/")[0] } else { "nitesh999-cmd" }),
    [string]$Repo = $(if ($env:GITHUB_REPOSITORY -and $env:GITHUB_REPOSITORY.Contains("/")) { $env:GITHUB_REPOSITORY.Split("/")[1] } else { "nitsyclaw" }),
    [string]$Branch = $(if ($env:GITHUB_REF_NAME) { $env:GITHUB_REF_NAME } else { "main" }),
    [string]$Commit = $(git rev-parse HEAD),
    [int]$Limit = 10,
    [switch]$AllowInProgress
)

$ErrorActionPreference = "Stop"

if ($Limit -lt 1 -or $Limit -gt 50) {
    throw "Limit must be between 1 and 50."
}
if (-not $Owner -or -not $Repo) {
    throw "Owner and Repo are required."
}
if (-not $Commit) {
    throw "Commit is required."
}

$headers = @{
    "Accept" = "application/vnd.github+json"
    "User-Agent" = "nitsyclaw-ci-status"
    "X-GitHub-Api-Version" = "2022-11-28"
}
if ($env:GITHUB_TOKEN) {
    $headers["Authorization"] = "Bearer $($env:GITHUB_TOKEN)"
}

$shortCommit = $Commit.Substring(0, [Math]::Min(7, $Commit.Length))
$baseUri = "https://api.github.com/repos/$Owner/$Repo/actions/runs"
$query = "?branch=$([uri]::EscapeDataString($Branch))&per_page=$Limit"
$uri = "$baseUri$query"

Write-Host "== GitHub CI status =="
Write-Host "Repository: $Owner/$Repo"
Write-Host "Branch: $Branch"
Write-Host "Commit: $shortCommit"
Write-Host "Auth: $(if ($env:GITHUB_TOKEN) { "token" } else { "none" })"

try {
    $response = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers -TimeoutSec 30
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 403 -and -not $env:GITHUB_TOKEN) {
        throw "GitHub API rate-limited unauthenticated CI status lookup. Set GITHUB_TOKEN and rerun."
    }
    throw
}

$runs = @($response.workflow_runs)
if ($runs.Count -lt 1) {
    throw "No GitHub Actions runs found for $Owner/$Repo branch $Branch."
}

$matchingRuns = @($runs | Where-Object { ([string]$_.head_sha).StartsWith($Commit) -or $Commit.StartsWith([string]$_.head_sha) })
if ($matchingRuns.Count -lt 1) {
    Write-Host "Recent runs:"
    foreach ($run in $runs) {
        $head = [string]$run.head_sha
        $headShort = if ($head.Length -gt 7) { $head.Substring(0, 7) } else { $head }
        Write-Host "- $($run.name) $($run.status)/$($run.conclusion) $headShort $($run.html_url)"
    }
    throw "No GitHub Actions run found for commit $shortCommit in the last $Limit run(s)."
}

$failed = @()
$inProgress = @()
foreach ($run in $matchingRuns) {
    $head = [string]$run.head_sha
    $headShort = if ($head.Length -gt 7) { $head.Substring(0, 7) } else { $head }
    $status = [string]$run.status
    $conclusion = [string]$run.conclusion
    if ([string]::IsNullOrWhiteSpace($conclusion)) {
        $conclusion = "none"
    }
    Write-Host "- $($run.name) $status/$conclusion $headShort $($run.html_url)"

    if ($status -ne "completed") {
        $inProgress += $run
        continue
    }
    if ($conclusion -ne "success") {
        $failed += $run
    }
}

if ($failed.Count -gt 0) {
    throw "$($failed.Count) GitHub Actions run(s) for $shortCommit failed or did not succeed."
}
if ($inProgress.Count -gt 0 -and -not $AllowInProgress) {
    throw "$($inProgress.Count) GitHub Actions run(s) for $shortCommit are still in progress. Rerun later or pass -AllowInProgress for a non-blocking check."
}

Write-Host "github_ci_status=ok"
Write-Host "matching_runs=$($matchingRuns.Count)"
