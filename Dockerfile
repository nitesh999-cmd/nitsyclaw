# NitsyClaw bot Dockerfile for Railway
# Uses Node 22 slim + system Chromium installed at /usr/bin/chromium.
# pdf-parse requires >=20.16 <21 or >=22.3; Railway must not run the older Node 20.11 runtime.
FROM node:22.19.0-slim

# Install Chromium and the libraries it needs at runtime.
# We use Debian's chromium since node:22-slim is Debian-based, not Ubuntu.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    gosu \
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

# Runtime writes WhatsApp session and local secret files under the non-root
# node user's home directory, not inside the repository.
RUN mkdir -p /home/node/.nitsyclaw/secrets \
    && chown -R node:node /app /home/node/.nitsyclaw

COPY scripts/docker-entrypoint.sh /usr/local/bin/nitsyclaw-entrypoint.sh
RUN chmod 755 /usr/local/bin/nitsyclaw-entrypoint.sh

# Set the working directory to the bot app for runtime
WORKDIR /app/apps/bot

# Start as root only long enough to make the mounted Railway volume writable,
# then the entrypoint drops privileges to the non-root node user.
# nosemgrep: dockerfile.security.last-user-is-root.last-user-is-root
USER root
ENTRYPOINT ["sh", "/usr/local/bin/nitsyclaw-entrypoint.sh"]
CMD ["pnpm", "start"]
