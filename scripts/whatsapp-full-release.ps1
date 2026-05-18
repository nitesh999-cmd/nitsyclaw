param(
    [string]$ExpectedCommit = $(git rev-parse --short HEAD),
    [switch]$SkipLocalGates
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Command
    )

    Write-Host ""
    Write-Host "== $Name =="
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE"
    }
}

Write-Host "== NitsyClaw WhatsApp full release =="
Write-Host "Expected commit: $ExpectedCommit"
Write-Host "This command does not commit or push. It proves the current pushed commit."

if (-not $SkipLocalGates) {
    Invoke-Step "WhatsApp release gate" {
        pnpm run whatsapp:release-gate
    }
    Invoke-Step "Lint" {
        pnpm lint
    }
    Invoke-Step "Typecheck" {
        pnpm -r typecheck
    }
    Invoke-Step "Build" {
        pnpm build
    }
}

git diff --quiet
if ($LASTEXITCODE -ne 0) {
    throw "Tracked working tree changes are not committed. Commit or discard them before proving a deployed release."
}
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    throw "Staged changes are not committed. Commit them before proving a deployed release."
}

$upstream = git rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>$null
if ($LASTEXITCODE -ne 0 -or -not $upstream) {
    throw "No upstream branch is configured. Push this branch first, then rerun."
}

$head = git rev-parse HEAD
$remoteHead = git rev-parse "@{u}"
if ($head -ne $remoteHead) {
    Write-Host ""
    Write-Host "Local gates passed, but HEAD is not pushed to $upstream."
    Write-Host "Push this branch with your normal Git command."
    Write-Host "Then run: pnpm run release:whatsapp-full -- -SkipLocalGates"
    exit 2
}

Invoke-Step "Wait for Railway deployment" {
    pnpm run release:wait-railway -- -ExpectedCommit $ExpectedCommit
}

Invoke-Step "Post-deploy proof" {
    pnpm run release:post-deploy-proof
}

Write-Host ""
Write-Host "WhatsApp full release proof passed."
