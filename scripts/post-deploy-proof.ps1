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
$phoneProofPrompts = @(
    @{
        Prompt = "proof test"
        Expected = "Short WhatsApp proof with current commit, DB marker, send/client state, and Loop guard."
    },
    @{
        Prompt = "proof details"
        Expected = "Full diagnostic proof with inbound/routing, outbound delivery, DB marker, runtime, send, and loop guard lines."
    },
    @{
        Prompt = "I spent `$6.50 at Chemist Warehouse for medicine"
        Expected = "Expense logged in AUD, not USD."
    },
    @{
        Prompt = "what can you do"
        Expected = "Compact NitsyClaw menu with Try, Works now, Needs setup, Safety, and More."
    },
    @{
        Prompt = "I am in Sydney until tomorrow. What is the weather tomorrow?"
        Expected = "Uses Sydney for this travelling request without changing the saved home location."
    },
    @{
        Prompt = "My home location is Melbourne, Victoria, Australia"
        Expected = "Confirms Melbourne is saved as the default home location."
    },
    @{
        Prompt = "Use AUD as my default currency and always reply in English"
        Expected = "Confirms AUD and English preferences are saved."
    },
    @{
        Prompt = "what do you know about my location and preferences?"
        Expected = "Shows only safe saved profile context, including home/current location, currency, timezone, and reply language where available."
    },
    @{
        Prompt = "build all pending features"
        Expected = "Truthful Pending build plan with Works now, Can build without you, Needs setup, and Best next setup."
    },
    @{
        Prompt = "person: Maya | neighbour | birthday: 5 May | channel: WhatsApp | last: school pickup | next: ask about Saturday"
        Expected = "Saves Maya as people memory and says it will draft before contacting anyone."
    },
    @{
        Prompt = "people memory"
        Expected = "Lists saved people memory, including Maya, without contacting anyone."
    },
    @{
        Prompt = "can't-do guard"
        Expected = "Shows what cannot be done live yet, what is blocked for safety, and what can be queued or drafted instead."
    }
)

for ($i = 0; $i -lt $phoneProofPrompts.Count; $i++) {
    $number = $i + 1
    Write-Host "$number. $($phoneProofPrompts[$i].Prompt)"
    Write-Host "   Expected: $($phoneProofPrompts[$i].Expected)"
}

$phoneProofDir = ".nitsyclaw-local/phone-proof-checklists"
$releaseProofDir = ".nitsyclaw-local/release-proof"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$phoneProofPath = Join-Path $phoneProofDir "phone-proof-$timestamp.md"
New-Item -ItemType Directory -Force -Path $phoneProofDir | Out-Null
New-Item -ItemType Directory -Force -Path $releaseProofDir | Out-Null

$phoneProofLines = @(
    "# NitsyClaw Phone Proof Checklist",
    "",
    "Created: $(Get-Date -Format o)",
    "",
    "Server-side gates passed before this checklist was written.",
    "",
    "Send these in WhatsApp self-chat and record the result:",
    ""
)

for ($i = 0; $i -lt $phoneProofPrompts.Count; $i++) {
    $number = $i + 1
    $prompt = $phoneProofPrompts[$i].Prompt
    $expected = $phoneProofPrompts[$i].Expected
    $phoneProofLines += ("{0}. [ ] ``{1}``" -f $number, $prompt)
    $phoneProofLines += ("   - Expected: {0}" -f $expected)
    $phoneProofLines += "   - Actual:"
    $phoneProofLines += ""
}

$phoneProofLines | Set-Content -Path $phoneProofPath -Encoding UTF8
$releaseProof = [ordered]@{
    createdAt = (Get-Date -Format o)
    commit = (git rev-parse --short HEAD)
    railwayReady = $true
    liveSmoke = $true
    phoneProofRequired = $true
    phoneProofChecklist = $phoneProofPath
    releaseWarRoom = "/release"
    rollbackNotes = @(
        "In Railway, open the last known good deployment and promote it again.",
        "Or revert this Git commit, sync main, then rerun release:whatsapp-full for the new commit.",
        "If WhatsApp is unhealthy, do not bounce the service blindly; check logs for the fatal line first."
    )
}
$releaseProofPath = Join-Path $releaseProofDir "latest-post-deploy-proof.json"
$releaseProof | ConvertTo-Json -Depth 5 | Set-Content -Path $releaseProofPath -Encoding UTF8
Write-Host ""
Write-Host "Phone proof checklist written to $phoneProofPath"
Write-Host "Release proof report written to $releaseProofPath"
Write-Host "Visible in app: /release"
Write-Host "Post-deploy proof passed for server-side gates. Phone proof still requires the WhatsApp messages above."
Write-Host ""
Write-Host "Rollback note:"
Write-Host "1. In Railway, open the last known good deployment and promote it again."
Write-Host "2. Or revert this Git commit, sync main, then rerun release:whatsapp-full for the new commit."
Write-Host "3. If WhatsApp is unhealthy, do not bounce the service blindly; check logs for the fatal line first."
