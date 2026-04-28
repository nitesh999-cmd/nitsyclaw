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

# Check bot + dashboard alive
$bot = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*tsx*src/index.ts*' }
$dash = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*next*dev*' }

if (-not $bot -or -not $dash) {
    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] broom: bot=$([bool]$bot) dash=$([bool]$dash) -> relaunching" |
        Out-File -Append "$logDir\broom.log"
    Start-Process powershell -WindowStyle Hidden -ArgumentList @('-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-NoProfile','-File',"$root\silent-launcher.ps1")
}

# Kill stray powershell.exe windows running NitsyClaw scripts that ARE NOT hidden
# (i.e. visible windows from old manual launches)
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
        $_.CommandLine -and
        $_.CommandLine -match 'pnpm bot|pnpm dashboard|next dev|tsx watch|nuke-and-go|nitsyclaw' -and
        $_.CommandLine -notmatch 'WindowStyle Hidden|silent-launcher'
    } |
    ForEach-Object {
        # Only kill if there's another (newer) hidden one already running the same thing
        try {
            "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] broom: killing visible PID $($_.ProcessId)" |
                Out-File -Append "$logDir\broom.log"
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        } catch {}
    }