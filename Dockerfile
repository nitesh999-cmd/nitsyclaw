# NitsyClaw bot Dockerfile for Railway
# Uses Node 22 slim + system Chromium installed at /usr/bin/chromium.
# pdf-parse requires >=20.16 <21 or >=22.3; Railway must not run the older Node 20.11 runtime.
FROM node:22-slim

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

# Install the same pnpm version declared by the root package manager.
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

# Set up app directory
WORKDIR /app

# Copy package manifests first (for better caching)
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY apps/bot/package.json ./apps/bot/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies reproducibly from the committed lockfile.
RUN pnpm install --frozen-lockfile

# Copy the rest of the source
COPY . .

# Set the working directory to the bot app for runtime
WORKDIR /app/apps/bot

# Start command
CMD ["pnpm", "start"]
