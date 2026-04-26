# Switch Railway from nixpacks to a Dockerfile.
# Nixpacks has caused too many issues with apt/Chromium handling.
# A Dockerfile gives us full control: install Chrome, install pnpm, deps, run.
#
# Run: powershell -ExecutionPolicy Bypass -File C:\Users\Nitesh\projects\NitsyClaw\switch-to-dockerfile.ps1

$ErrorActionPreference = "Stop"
$root = "C:\Users\Nitesh\projects\NitsyClaw"
$enc = New-Object System.Text.UTF8Encoding $false

if (-not (Test-Path $root)) {
    Write-Host "ERROR: NitsyClaw not found at $root" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Switching to Dockerfile-based deploy..." -ForegroundColor Cyan
Write-Host ""

# 1. Write Dockerfile at repo root
$dockerfile = @'
# NitsyClaw bot Dockerfile for Railway
# Uses Node 20 slim + system Chromium installed at /usr/bin/chromium
FROM node:20-slim

# Install Chromium and the libraries it needs at runtime.
# We use Debian's chromium since node:20-slim is Debian-based, not Ubuntu.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    libnss3 \
    libxss1 \
    libgbm1 \
    libgtk-3-0 \
    libcups2 \
    libxkbcommon0 \
    libxshmfence1 \
    libdrm2 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use the system Chromium (do NOT download its own copy)
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Set up app directory
WORKDIR /app

# Copy package manifests first (for better caching)
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY apps/bot/package.json ./apps/bot/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Copy the rest of the source
COPY . .

# Set the working directory to the bot app for runtime
WORKDIR /app/apps/bot

# Start command
CMD ["pnpm", "start"]
'@
[System.IO.File]::WriteAllText("$root\Dockerfile", $dockerfile, $enc)
Write-Host "  [1/3] Wrote Dockerfile (uses Debian chromium, not Ubuntu)" -ForegroundColor Green

# 2. Update railway.json to use Dockerfile
$railway = @'
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
'@
[System.IO.File]::WriteAllText("$root\railway.json", $railway, $enc)
Write-Host "  [2/3] Updated railway.json to use Dockerfile builder" -ForegroundColor Green

# 3. Delete nixpacks.toml so Railway has nothing to fall back to
if (Test-Path "$root\nixpacks.toml") {
    Remove-Item "$root\nixpacks.toml" -Force
    Write-Host "  [3/3] Removed nixpacks.toml (was causing conflicts)" -ForegroundColor Green
} else {
    Write-Host "  [3/3] No nixpacks.toml to remove" -ForegroundColor Yellow
}

# 4. Commit and push
Push-Location $root
try {
    git add Dockerfile railway.json
    git rm -f nixpacks.toml 2>$null
    git add -A
    git commit -m "fix(railway): switch from nixpacks to dockerfile (debian + chromium)"
    git push
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "===================================" -ForegroundColor Cyan
Write-Host " Pushed. Railway will rebuild with Dockerfile." -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " - Dockerfile uses Debian (not Ubuntu) - libasound2 still works" -ForegroundColor White
Write-Host " - Chromium installed at /usr/bin/chromium" -ForegroundColor White
Write-Host " - Build takes ~5-7 minutes (apt + pnpm install + copy files)" -ForegroundColor White
Write-Host ""
Write-Host " After build:" -ForegroundColor White
Write-Host "  1. Watch Deploy Logs for [wwebjs] QR code received" -ForegroundColor White
Write-Host "  2. Scan QR with phone" -ForegroundColor White
Write-Host "  3. Add GOOGLE_CREDENTIALS_JSON + GOOGLE_TOKEN_JSON to Variables tab" -ForegroundColor White
Write-Host ""
