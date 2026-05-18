$ErrorActionPreference = "Stop"

Write-Host "== NitsyClaw WhatsApp reply shape gate =="
Write-Host "Scope: deterministic WhatsApp replies that users see for status, help, pending items, and noisy receipts."
Write-Host "No live WhatsApp sends. No Railway mutation. No provider OAuth actions."

pnpm run whatsapp:reply-shape-report
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

pnpm exec vitest run `
    apps/bot/test/router.integration.test.ts `
    apps/bot/src/whatsapp-provider-readiness.test.ts `
    apps/bot/src/whatsapp-capability-registry.test.ts `
    apps/bot/src/whatsapp-reply-format.test.ts `
    --testNamePattern "Saved|working receipt|what can you do|ready pending setup status|pending items|local files|provider readiness|capability|self-test|incident summary|canary|WhatsApp reply format"
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host "WhatsApp reply shape gate passed."
