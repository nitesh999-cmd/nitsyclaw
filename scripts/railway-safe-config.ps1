param(
    [string]$Environment = $(if ($env:RAILWAY_ENVIRONMENT) { $env:RAILWAY_ENVIRONMENT } else { "production" }),
    [string]$ServiceId = $(if ($env:RAILWAY_SERVICE_ID) { $env:RAILWAY_SERVICE_ID } else { "85acd7bd-b3ea-428f-83ee-e99f6867d471" })
)

$ErrorActionPreference = "Stop"

function Invoke-RailwayJson {
    param([Parameter(Mandatory = $true)][string[]]$Args)

    $output = & pnpm --silent dlx @railway/cli @Args 2>&1
    $text = $output -join "`n"
    if ($LASTEXITCODE -ne 0) {
        Write-Host $text
        throw "Railway command failed with exit code $LASTEXITCODE"
    }
    return $text | ConvertFrom-Json
}

$config = Invoke-RailwayJson -Args @("environment", "config", "--environment", $Environment, "--json")
$service = $config.services.$ServiceId
if (-not $service) {
    throw "Service '$ServiceId' was not found in Railway environment '$Environment'."
}

$variableNames = @($service.variables.PSObject.Properties.Name | Sort-Object)
$summary = [pscustomobject]@{
    environment = $Environment
    serviceId = $ServiceId
    source = [pscustomobject]@{
        repo = $service.source.repo
        branch = $service.source.branch
        rootDirectory = $service.source.rootDirectory
        checkSuites = $service.source.checkSuites
    }
    build = [pscustomobject]@{
        builder = $service.build.builder
        dockerfilePath = $service.build.dockerfilePath
        buildCommand = $service.build.buildCommand
    }
    deploy = [pscustomobject]@{
        startCommand = $service.deploy.startCommand
        restartPolicyType = $service.deploy.restartPolicyType
        restartPolicyMaxRetries = $service.deploy.restartPolicyMaxRetries
        sleepApplication = $service.deploy.sleepApplication
    }
    networking = [pscustomobject]@{
        serviceDomains = @($service.networking.serviceDomains.PSObject.Properties.Name | Sort-Object)
    }
    variables = [pscustomobject]@{
        count = $variableNames.Count
        names = $variableNames
        values = "[redacted]"
    }
    volumeMounts = @($service.volumeMounts.PSObject.Properties.Name | Sort-Object)
}

$summary | ConvertTo-Json -Depth 8
