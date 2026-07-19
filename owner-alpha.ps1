[CmdletBinding()]
param(
    [switch]$Health
)

$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
$blockedKeys = @(
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'DATABASE_URL',
    'DATABASE_URL_DIRECT',
    'ENCRYPTION_KEY',
    'SERPER_API_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_CREDENTIALS_JSON',
    'GOOGLE_TOKEN_JSON',
    'GOOGLE_ACCESS_TOKEN',
    'GOOGLE_REFRESH_TOKEN',
    'MS_CLIENT_ID',
    'MS_CLIENT_SECRET',
    'MS_TENANT_ID',
    'MS_TOKEN_JSON',
    'MS_ACCESS_TOKEN',
    'MS_REFRESH_TOKEN',
    'SPOTIFY_CLIENT_ID',
    'SPOTIFY_CLIENT_SECRET',
    'SPOTIFY_ACCESS_TOKEN',
    'SPOTIFY_REFRESH_TOKEN',
    'SPOTIFY_REDIRECT_URI',
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'AZURE_OPENAI_API_KEY',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
    'COHERE_API_KEY',
    'MISTRAL_API_KEY',
    'GROQ_API_KEY',
    'XAI_API_KEY',
    'DEEPSEEK_API_KEY',
    'HUGGINGFACE_TOKEN',
    'HF_TOKEN',
    'NEXT_PUBLIC_POSTHOG_KEY',
    'POSTHOG_API_KEY',
    'NTFY_TOPIC',
    'WINDOWS_TOAST',
    'NOTIFY_EMAIL',
    'RESEND_API_KEY',
    'SENDGRID_API_KEY',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'WHATSAPP_OWNER_NUMBER',
    'WHATSAPP_SESSION',
    'WHATSAPP_SESSION_PATH',
    'NITSYCLAW_SECRET_ROOT',
    'NITSYCLAW_DASHBOARD_PASSWORD',
    'NITSYCLAW_DASHBOARD_USER',
    'NITSYCLAW_DEV_AUTH_BYPASS',
    'RAILWAY_TOKEN',
    'VERCEL_TOKEN',
    'VERCEL',
    'VERCEL_ENV',
    'RAILWAY_ENVIRONMENT',
    'RAILWAY_SERVICE_NAME'
)
$credentialNamePattern = '(API_KEY|ACCESS_KEY_ID|SECRET_ACCESS_KEY|ACCESS_TOKEN|AUTH_TOKEN|REFRESH_TOKEN|SESSION_TOKEN|CLIENT_SECRET|TOKEN_JSON|CREDENTIALS_JSON|PASSWORD|PRIVATE_KEY|WEBHOOK_URL|CONNECTION_STRING|DATABASE_URL)$'
$dynamicBlockedKeys = Get-ChildItem Env: | Where-Object { $_.Name -match $credentialNamePattern } | Select-Object -ExpandProperty Name
$blockedKeys = @($blockedKeys + $dynamicBlockedKeys + @('GITHUB_TOKEN', 'GH_TOKEN', 'NPM_TOKEN', 'SSH_AUTH_SOCK', 'GIT_ASKPASS')) | Sort-Object -Unique
$managedKeys = @(
    'NODE_ENV',
    'NITSYCLAW_MODEL_MODE',
    'OLLAMA_BASE_URL',
    'OLLAMA_CHAT_MODEL',
    'OLLAMA_EMBEDDING_MODEL',
    'OLLAMA_TIMEOUT_MS',
    'OLLAMA_RETRIES',
    'OLLAMA_CONTEXT_LIMIT',
    'OLLAMA_KEEP_ALIVE',
    'OLLAMA_THINK'
) + $blockedKeys
$originalEnvironment = @{}
$originalLocation = Get-Location
$exitCode = 1

foreach ($key in $managedKeys) {
    $originalEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
}

try {
    if (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'package.json'))) {
        throw 'Owner-alpha launcher could not find the NitsyClaw repository.'
    }
    if (-not (Get-Command corepack.cmd -ErrorAction SilentlyContinue)) {
        throw 'corepack.cmd is unavailable. Restore the existing Node.js environment before starting owner alpha.'
    }

    foreach ($key in $blockedKeys) {
        [Environment]::SetEnvironmentVariable($key, $null, 'Process')
    }
    [Environment]::SetEnvironmentVariable('NODE_ENV', $null, 'Process')
    [Environment]::SetEnvironmentVariable('NITSYCLAW_MODEL_MODE', 'local_only', 'Process')
    [Environment]::SetEnvironmentVariable('OLLAMA_BASE_URL', 'http://127.0.0.1:11434', 'Process')
    [Environment]::SetEnvironmentVariable('OLLAMA_CHAT_MODEL', 'qwen3:8b', 'Process')
    [Environment]::SetEnvironmentVariable('OLLAMA_EMBEDDING_MODEL', 'nomic-embed-text:latest', 'Process')
    [Environment]::SetEnvironmentVariable('OLLAMA_TIMEOUT_MS', '45000', 'Process')
    [Environment]::SetEnvironmentVariable('OLLAMA_RETRIES', '1', 'Process')
    [Environment]::SetEnvironmentVariable('OLLAMA_CONTEXT_LIMIT', '4096', 'Process')
    [Environment]::SetEnvironmentVariable('OLLAMA_KEEP_ALIVE', '5m', 'Process')
    [Environment]::SetEnvironmentVariable('OLLAMA_THINK', 'false', 'Process')

    Set-Location -LiteralPath $repoRoot
    if ($Health) {
        & corepack.cmd pnpm run local-brain:owner-alpha:health
    } else {
        & corepack.cmd pnpm run local-brain:owner-alpha
    }
    $exitCode = $LASTEXITCODE
} catch {
    Write-Error $_
    $exitCode = 1
} finally {
    Set-Location -LiteralPath $originalLocation
    foreach ($key in $managedKeys) {
        [Environment]::SetEnvironmentVariable($key, $originalEnvironment[$key], 'Process')
    }
}

exit $exitCode
