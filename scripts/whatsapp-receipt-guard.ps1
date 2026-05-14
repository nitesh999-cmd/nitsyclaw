$ErrorActionPreference = "Stop"

Write-Host "== WhatsApp receipt guard =="

$forbidden = @(
    "Saved. Working on it.",
    "Saved. Needs your approval before I act."
)

$sourceRoots = @(
    "apps/bot/src",
    "packages/shared/src"
)

$violations = @()
foreach ($root in $sourceRoots) {
    if (-not (Test-Path $root)) {
        continue
    }

    foreach ($pattern in $forbidden) {
        $found = @(Get-ChildItem -Path $root -Recurse -File -Include *.ts,*.tsx |
            Where-Object { $_.Name -notmatch '\.test\.(ts|tsx)$' -and $_.Name -notmatch '\.spec\.(ts|tsx)$' } |
            Select-String -SimpleMatch -Pattern $pattern |
            Where-Object { $null -ne $_ })
        if ($found.Count -gt 0) {
            $violations += $found
        }
    }
}

if ($violations.Count -gt 0) {
    Write-Host "Forbidden WhatsApp receipt wording found in active source:"
    foreach ($match in $violations) {
        Write-Host ("{0}:{1}: {2}" -f $match.Path, $match.LineNumber, $match.Line.Trim())
    }
    exit 1
}

pnpm exec vitest run `
    packages/shared/test/01-text-command.test.ts `
    apps/bot/src/whatsapp-send-monitor.test.ts `
    apps/bot/test/router.integration.test.ts `
    packages/shared/test/24-command-jobs.test.ts `
    packages/shared/test/25-personal-pa-intent.test.ts `
    apps/bot/src/whatsapp-loop-breaker.test.ts
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host "WhatsApp receipt guard passed."
