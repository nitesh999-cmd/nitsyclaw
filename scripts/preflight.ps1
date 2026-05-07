$ErrorActionPreference = "Stop"

Write-Host "== NitsyClaw safe release preflight =="
Write-Host ""

Write-Host "[1/6] Git branch/status"
git status --short --branch
if ($LASTEXITCODE -ne 0) {
    throw "git status failed"
}

Write-Host ""
Write-Host "[2/6] Secret/local-file checks"
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
    '(^|/)\.env\.local$',
    '(^|/)package-lock\.json$'
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

$forbiddenRepoPatterns = @(
    '.env',
    '.env.local',
    '.env.*.local',
    'google-credentials.json',
    'google-token*.json',
    'ms-token.json',
    '*.sqlite',
    '*.db',
    'package-lock.json'
)
$excludedRepoDirs = @(
    '.git',
    'node_modules',
    '.pnpm-store',
    'dist',
    '.next',
    'coverage',
    'playwright-report',
    'test-results'
)
function Get-RepoLocalSecretPaths {
    param([string]$RootPath)

    $results = New-Object System.Collections.Generic.List[string]
    $stack = New-Object System.Collections.Generic.Stack[System.IO.DirectoryInfo]
    $root = Get-Item -LiteralPath $RootPath -Force
    $stack.Push($root)

    while ($stack.Count -gt 0) {
        $directory = $stack.Pop()

        $files = @(Get-ChildItem -LiteralPath $directory.FullName -Force -File -ErrorAction SilentlyContinue)
        foreach ($file in $files) {
            if ($file.Name -eq '.env.local.example') {
                continue
            }
            foreach ($pattern in $forbiddenRepoPatterns) {
                if ($file.Name -like $pattern) {
                    [void]$results.Add($file.FullName)
                    break
                }
            }
        }

        $directories = @(Get-ChildItem -LiteralPath $directory.FullName -Force -Directory -ErrorAction SilentlyContinue)
        foreach ($childDirectory in $directories) {
            if ($excludedRepoDirs -contains $childDirectory.Name) {
                continue
            }
            if ($childDirectory.Name -eq '.wa-session') {
                [void]$results.Add($childDirectory.FullName)
                continue
            }
            $stack.Push($childDirectory)
        }
    }

    return $results.ToArray()
}
$forbiddenRepoPaths = @(Get-RepoLocalSecretPaths -RootPath ".")
if ($forbiddenRepoPaths.Count -gt 0) {
    $externalSecretRoot = if ($env:NITSYCLAW_SECRET_ROOT) { $env:NITSYCLAW_SECRET_ROOT } else { Join-Path $HOME ".nitsyclaw\secrets" }
    $list = ($forbiddenRepoPaths | Sort-Object -Unique | ForEach-Object { " - $_" }) -join "`n"
    throw "Local secrets/session files exist inside the repo. Move them to $externalSecretRoot before release:`n$list"
}
Write-Host "No repo-local secret/session files detected."

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
