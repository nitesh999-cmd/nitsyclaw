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

$matches = @()
foreach ($root in $sourceRoots) {
    if (-not (Test-Path $root)) {
        continue
    }

    foreach ($pattern in $forbidden) {
        $found = Get-ChildItem -Path $root -Recurse -File -Include *.ts,*.tsx |
            Select-String -SimpleMatch -Pattern $pattern
        if ($found) {
            $matches += $found
        }
    }
}

if ($matches.Count -gt 0) {
    Write-Host "Forbidden WhatsApp receipt wording found in active source:"
    foreach ($match in $matches) {
        Write-Host ("{0}:{1}: {2}" -f $match.Path, $match.LineNumber, $match.Line.Trim())
    }
    exit 1
}

pnpm exec vitest run `
    apps/bot/test/router.integration.test.ts `
    packages/shared/test/24-command-jobs.test.ts `
    packages/shared/test/25-personal-pa-intent.test.ts `
    apps/bot/src/whatsapp-loop-breaker.test.ts
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host "WhatsApp receipt guard passed."
