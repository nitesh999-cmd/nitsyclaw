import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/dashboard/test/e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
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
    command: "corepack pnpm --filter @nitsyclaw/dashboard exec next dev -p 3101",
    port: 3101,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
