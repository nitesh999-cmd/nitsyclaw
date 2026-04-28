# NitsyClaw broom. Kills stray PowerShell windows running NitsyClaw scripts
# that have been idle (no foreground focus) for >5 min. Also restarts bot+dashboard
# if they died.
$ErrorActionPreference = 'Continue'
$root = 'C:\Users\Nitesh\projects\NitsyClaw'
$logDir = 'C:\Users\Nitesh\projects\NitsyClaw\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Heartbeat - touch this file every tick so user can verify broom is alive
# without tailing the log. Just check Get-Item "$logDir\broom-last-tick.txt"
(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | Out-File -Force "$logDir\broom-last-tick.txt"

# Check bot only. Dashboard runs on Vercel (production); local dashboard is
# optional and NOT a broom responsibility - restarting both via silent-launcher
# was killing the bot mid-message every 2 min (silent-launcher kills all node).
$bot = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*tsx*src/index.ts*' }

if (-not $bot) {
    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] broom: bot dead -> launch-bot.ps1" |
        Out-File -Append "$logDir\broom.log"
    # launch-bot.ps1 is idempotent and only touches the bot process (not dashboard,
    # not other node processes). Safe to call repeatedly.
    Start-Process powershell -WindowStyle Hidden -ArgumentList @(
        '-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-NoProfile',
        '-File',"$root\launch-bot.ps1"
    )
}

# Kill stray powershell.exe windows running NitsyClaw scripts that ARE NOT hidden
# (i.e. visible windows from old manual launches).
# NOTE: regex is narrowed to actual stale-launcher signatures (pnpm bot | pnpm
# dashboard | next dev | tsx watch). The bare 'nitsyclaw' match used to make
# the broom kill ITSELF every tick (its own commandline contains the project
# path). Also excludes our own broom.ps1 + launch-bot.ps1 + silent-launcher.
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
        $_.CommandLine -and
        $_.CommandLine -match '(pnpm bot|pnpm dashboard|next dev|tsx watch|nuke-and-go)' -and
        $_.CommandLine -notmatch '(WindowStyle Hidden|silent-launcher\.ps1|launch-bot\.ps1|broom\.ps1|broom-silent\.vbs)'
    } |
    ForEach-Object {
        try {
            "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] broom: killing visible PID $($_.ProcessId)" |
                Out-File -Append "$logDir\broom.log"
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        } catch {}
    }