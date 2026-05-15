$ErrorActionPreference = "Stop"

Write-Host "== NitsyClaw WhatsApp reply shape gate =="
Write-Host "Scope: deterministic WhatsApp replies that users see for status, help, pending items, and noisy receipts."
Write-Host "No live WhatsApp sends. No Railway mutation. No provider OAuth actions."

pnpm exec vitest run `
    apps/bot/test/router.integration.test.ts `
    apps/bot/src/whatsapp-provider-readiness.test.ts `
    apps/bot/src/whatsapp-capability-registry.test.ts `
    --testNamePattern "Saved|working receipt|what can you do|ready pending setup status|pending items|provider readiness|capability|self-test|incident summary|canary"
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host "WhatsApp reply shape gate passed."
