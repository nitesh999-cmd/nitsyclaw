# NitsyClaw bot-only launcher. Only starts the bot, not dashboard.
# Idempotent for production start mode. Dev/watch bot processes are migrated
# to production start mode so always-on is not accidentally backed by tsx watch.

$ErrorActionPreference = 'Continue'
$root = 'C:\Users\Nitesh\projects\NitsyClaw'
$logDir = 'C:\Users\Nitesh\projects\NitsyClaw\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Get-DescendantProcessIds {
    param([int[]]$ParentIds, [object[]]$AllProcesses)
    $result = @()
    $frontier = @($ParentIds)
    while ($frontier.Count -gt 0) {
        $next = @()
        foreach ($parentId in $frontier) {
            $children = $AllProcesses | Where-Object { $_.ParentProcessId -eq $parentId }
            foreach ($child in $children) {
                if ($result -notcontains $child.ProcessId) {
                    $result += $child.ProcessId
                    $next += $child.ProcessId
                }
            }
        }
        $frontier = $next
    }
    return $result
}

function Stop-ProcessTree {
    param([object[]]$Roots)
    if (-not $Roots -or $Roots.Count -eq 0) { return }
    $all = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
    $ids = @($Roots | ForEach-Object { $_.ProcessId })
    $ids += Get-DescendantProcessIds -ParentIds $ids -AllProcesses $all
    $ids | Select-Object -Unique | ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
}

function Get-BotRuntimeProcesses {
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -and (
                $_.CommandLine -like '*pnpm.cjs*--filter*@nitsyclaw/bot*start*' -or
                $_.CommandLine -like '*pnpm.cjs*"--filter"*"@nitsyclaw/bot"*"start"*' -or
                ($_.CommandLine -like '*NitsyClaw*apps*bot*node_modules*.bin*tsx*src/index.ts*' -and $_.CommandLine -notlike '*watch*')
            )
        }
}

function Get-BotDevProcesses {
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -and (
                $_.CommandLine -like '*@nitsyclaw/bot*dev*' -or
                $_.CommandLine -like '*tsx*watch*src/index.ts*'
            )
        }
}

$dev = @(Get-BotDevProcesses)
if ($dev.Count -gt 0) {
    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] launch-bot: stopping dev/watch bot before production start" |
        Out-File -Append "$logDir\launcher.log"
    Stop-ProcessTree -Roots $dev
    Start-Sleep -Seconds 2
}

$alive = @(Get-BotRuntimeProcesses)
if ($alive.Count -gt 0) {
    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] launch-bot: already alive (PID $($alive.ProcessId | Select-Object -First 1)), skipping" |
        Out-File -Append "$logDir\launcher.log"
    exit 0
}

Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -like '*NitsyClaw*apps*bot*.wa-session*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

Remove-Item -Force "$root\apps\bot\.wa-session\session\SingletonLock" -ErrorAction SilentlyContinue
Remove-Item -Force "$root\apps\bot\.wa-session\session\SingletonCookie" -ErrorAction SilentlyContinue
Remove-Item -Force "$root\apps\bot\.wa-session\session\SingletonSocket" -ErrorAction SilentlyContinue

Start-Process powershell -WindowStyle Hidden -ArgumentList @(
    '-ExecutionPolicy','Bypass',
    '-NoLogo','-NoProfile',
    '-Command',
    "Set-Location '$root'; pnpm --filter @nitsyclaw/bot start *>> '$logDir\bot.log'"
)
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] launch-bot: spawned" |
    Out-File -Append "$logDir\launcher.log"
