import { defineConfig } from "vitest/config";
import { availableParallelism } from "node:os";
import path from "node:path";

/**
 * Worker cap for Windows only.
 *
 * Vitest defaults to roughly one worker per core. On the four-core Windows CI
 * runner that over-subscribes the machine, because this suite contains
 * Windows-only tests that shell out: ollama-recovery.test.ts drives
 * scripts/ensure-ollama.ps1 through about sixteen Windows PowerShell launches,
 * and those are correctly given their own long budgets. Everything co-scheduled
 * with them is not — it runs on the 5000ms default while the cores are gone.
 *
 * The result was a CI failure that moved between unrelated tests: at c26ad2c a
 * SQLite test that takes 37ms locally and 62ms on Linux timed out at 5000ms; at
 * 144ac15c a freeze verifier that takes 26ms did; at c4d1ce5b a router test did.
 * None of them are slow. They were starved.
 *
 * Measured on a sixteen-core Windows machine, varying only this number, the
 * slowest single test was 5817ms at one worker per core, 4363ms at a half,
 * 3896ms at three eighths and 3523ms at an eighth — and from a half downward,
 * every test still above 2500ms was one of the ollama tests that already
 * carries an explicit budget. Halving is where the unbudgeted tail disappears.
 *
 * Non-Windows returns undefined so Linux keeps the default. The Linux job runs
 * the same 263 files in 3.91s and has never been implicated.
 */
export function resolveMaxWorkers(platform: NodeJS.Platform, parallelism: number): number | undefined {
  if (platform !== "win32") return undefined;
  return Math.max(1, Math.floor(parallelism / 2));
}

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    maxWorkers: resolveMaxWorkers(process.platform, availableParallelism()),
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: [
        "packages/shared/src/**",
        "apps/bot/src/feature-shortcut.ts",
        "apps/bot/src/personal-command-shortcuts.ts",
        "apps/bot/src/whatsapp-*.ts",
        "apps/dashboard/src/lib/**",
      ],
      exclude: [
        "**/*.d.ts",
        "**/*.js",
        "**/*.js.map",
        "**/*.test.ts",
        "**/test/**",
        "**/*.config.ts",
        "packages/shared/src/index.ts",
        "packages/shared/src/db/client.ts",
        "packages/shared/src/integrations/spotify.ts",
        "packages/shared/src/notify/**",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70,
      },
    },
  },
  resolve: {
    alias: {
      "@nitsyclaw/shared": path.resolve(__dirname, "packages/shared/src"),
    },
  },
});
