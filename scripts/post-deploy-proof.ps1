$ErrorActionPreference = "Stop"

Write-Host "== NitsyClaw post-deploy proof =="
Write-Host "Checks Railway WhatsApp worker, public dashboard smoke, and prints the phone proof prompts."
Write-Host ""

Write-Host "== Railway WhatsApp ready =="
pnpm run railway:whatsapp-ready
if ($LASTEXITCODE -ne 0) {
    throw "Railway WhatsApp ready gate failed."
}

Write-Host ""
Write-Host "== Public dashboard live smoke =="
pnpm run release:live-smoke
if ($LASTEXITCODE -ne 0) {
    throw "Public dashboard live smoke failed."
}

Write-Host ""
Write-Host "== Phone proof prompts =="
Write-Host "Send these in WhatsApp self-chat:"
Write-Host "1. proof test"
Write-Host "   Expected: WhatsApp proof, current commit, DB marker passed, Loop guard ok."
Write-Host "2. I spent `$6.50 at Chemist Warehouse for medicine"
Write-Host "   Expected: expense logged in AUD, not USD."
Write-Host "3. what can you do"
Write-Host "   Expected: NitsyClaw WhatsApp menu with Everyday help, Life admin, Operator checks, Needs setup first."
Write-Host ""
Write-Host "Post-deploy proof passed for server-side gates. Phone proof still requires the three WhatsApp messages above."
