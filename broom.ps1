# NitsyClaw broom. Bot-only watchdog for the local WhatsApp worker.

$ErrorActionPreference = 'Continue'
$root = 'C:\Users\Nitesh\projects\NitsyClaw'
$logDir = 'C:\Users\Nitesh\projects\NitsyClaw\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | Out-File -Force "$logDir\broom-last-tick.txt"

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

function Start-Bot {
    Start-Process powershell -WindowStyle Hidden -ArgumentList @(
        '-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-NoProfile',
        '-File',"$root\launch-bot.ps1"
    )
}

function Restart-Bot {
    param([object[]]$BotProcesses, [string]$Reason)
    $restartFile = "$logDir\bot-last-restart.txt"
    $cooldownMinutes = 5
    $lastRestart = Get-Item -LiteralPath $restartFile -ErrorAction SilentlyContinue
    if ($lastRestart -and $lastRestart.LastWriteTime -gt (Get-Date).AddMinutes(-$cooldownMinutes)) {
        "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] broom: restart suppressed by ${cooldownMinutes}m cooldown ($Reason)" |
            Out-File -Append "$logDir\broom.log"
        return
    }

    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] broom: restart bot -> $Reason" |
        Out-File -Append "$logDir\broom.log"
    (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | Out-File -Force $restartFile
    Stop-ProcessTree -Roots $BotProcesses
    Start-Sleep -Seconds 2
    Start-Bot
}

$bot = @(Get-BotRuntimeProcesses)

if ($bot.Count -eq 0) {
    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] broom: bot dead -> launch-bot.ps1" |
        Out-File -Append "$logDir\broom.log"
    Start-Bot
    exit 0
}

$healthFile = "$logDir\whatsapp-health-last-ok.txt"
$health = Get-Item -LiteralPath $healthFile -ErrorAction SilentlyContinue
$staleMinutes = 5
$oldestBotStart = ($bot | Sort-Object CreationDate | Select-Object -First 1).CreationDate

if (-not $health) {
    if ($oldestBotStart -and $oldestBotStart -lt (Get-Date).AddMinutes(-$staleMinutes)) {
        Restart-Bot -BotProcesses $bot -Reason "missing WhatsApp health heartbeat after ${staleMinutes}m"
    }
    exit 0
}

if ($health.LastWriteTime -lt (Get-Date).AddMinutes(-$staleMinutes)) {
    Restart-Bot -BotProcesses $bot -Reason "WhatsApp health heartbeat stale ($([int]((Get-Date) - $health.LastWriteTime).TotalMinutes)m)"
}

# Do not kill "visible" PowerShell windows here. Child processes launched by
# Start-Process do not reliably preserve hidden-window intent in command lines.
