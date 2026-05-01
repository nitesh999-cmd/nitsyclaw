# Legacy wrapper kept for any old Windows scheduled task action.
# The current supervisor is broom.ps1, which restarts only the WhatsApp bot.

$ErrorActionPreference = "Continue"
$root = "C:\Users\Nitesh\projects\NitsyClaw"
$broom = "$root\broom.ps1"

if (Test-Path $broom) {
    & powershell -ExecutionPolicy Bypass -WindowStyle Hidden -NoProfile -File $broom
} else {
    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] watchdog: broom.ps1 missing at $broom" |
        Out-File -Append "$root\logs\broom.log"
}
