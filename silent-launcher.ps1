# Legacy entry point kept for old Windows Startup shortcuts.
# Delegates to launch-bot.ps1 so startup uses the bot-only production runtime.

$ErrorActionPreference = 'Stop'
$root = 'C:\Users\Nitesh\projects\NitsyClaw'
$launcher = Join-Path $root 'launch-bot.ps1'

if (-not (Test-Path -LiteralPath $launcher)) {
    throw "Missing bot launcher: $launcher"
}

& powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $launcher
exit $LASTEXITCODE
