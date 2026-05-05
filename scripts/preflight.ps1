$ErrorActionPreference = "Stop"

Write-Host "== NitsyClaw safe release preflight =="
Write-Host ""

Write-Host "[1/6] Git branch/status"
git status --short --branch
if ($LASTEXITCODE -ne 0) {
    throw "git status failed"
}

Write-Host ""
Write-Host "[2/6] Staged secret/local-file check"
$stagedPaths = @(git diff --cached --name-only)
if ($LASTEXITCODE -ne 0) {
    throw "git diff --cached --name-only failed"
}
$forbiddenStagedPatterns = @(
    '^\.claude/settings\.local\.json$',
    '(^|/)\.vercel(/|$)',
    '(^|/)\.wa-session(/|$)',
    '(^|/)google-credentials\.json$',
    '(^|/)google-token.*\.json$',
    '(^|/)ms-token\.json$',
    '\.sqlite$',
    '\.db$',
    '(^|/)\.env$',
    '(^|/)\.env\..*\.local$',
    '(^|/)\.env\.local$'
)
foreach ($stagedPath in $stagedPaths) {
    $normalizedPath = $stagedPath -replace '\\', '/'
    foreach ($pattern in $forbiddenStagedPatterns) {
        if ($normalizedPath -match $pattern) {
            throw "Unsafe staged file for release: $stagedPath"
        }
    }
}
Write-Host "No staged secret/local files detected."

Write-Host ""
Write-Host "[3/6] Git remote"
$remote = git remote get-url origin
if ($LASTEXITCODE -ne 0) {
    throw "git remote get-url origin failed"
}
$githubHostPattern = "github" + "\.com"
$credentialedGithubRemotePattern = "https://[^/\s]+@" + $githubHostPattern
if ($remote -match $credentialedGithubRemotePattern) {
    throw "Unsafe git remote: credentials are embedded in origin."
}
$redactedGithubRemote = "https://[redacted]@" + ("github" + ".com")
$redactedRemote = $remote -replace ("https://([^/@\s]+)@" + $githubHostPattern), $redactedGithubRemote
Write-Host "origin $redactedRemote"

Write-Host ""
Write-Host "[4/6] Diff whitespace check"
git diff --check
if ($LASTEXITCODE -ne 0) {
    throw "git diff --check failed"
}
git diff --cached --check
if ($LASTEXITCODE -ne 0) {
    throw "git diff --cached --check failed"
}

Write-Host ""
Write-Host "[5/6] Release check"
pnpm release:check
if ($LASTEXITCODE -ne 0) {
    throw "pnpm release:check failed"
}

Write-Host ""
Write-Host "[6/6] Final status"
git status --short
if ($LASTEXITCODE -ne 0) {
    throw "git status --short failed"
}

Write-Host ""
Write-Host "Preflight passed. Review staged files manually before commit/push."
