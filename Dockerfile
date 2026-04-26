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