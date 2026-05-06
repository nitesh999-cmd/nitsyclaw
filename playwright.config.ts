import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    if (process.env[key]) continue;
    process.env[key] = unquoteEnvValue(trimmed.slice(separatorIndex + 1));
  }
}

const secretRoot = process.env.NITSYCLAW_SECRET_ROOT || resolve(homedir(), ".nitsyclaw", "secrets");
for (const file of [".env.local", "apps-dashboard.env.local", "packages-shared.env.local"]) {
  loadEnvFile(resolve(secretRoot, file));
}

export default defineConfig({
  testDir: "./apps/dashboard/test/e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: "http://localhost:3101",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "corepack pnpm --filter @nitsyclaw/dashboard exec next dev --webpack -p 3101",
    env: {
      ...process.env,
      NITSYCLAW_DEV_AUTH_BYPASS: "1",
    },
    port: 3101,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
    timeout: 60_000,
  },
});
