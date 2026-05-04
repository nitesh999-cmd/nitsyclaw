import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("watchdog self-healing contract", () => {
  test("broom publishes remote heartbeat evidence without blocking bot recovery", () => {
    const broom = readFileSync("broom.ps1", "utf8");

    expect(broom).toContain("Write-WatchdogHeartbeat");
    expect(broom).toContain("scripts/watchdog-heartbeat.ts");
    expect(broom).toContain("--source");
    expect(broom).toContain("local-watchdog");
    expect(broom).toContain("--event");
    expect(broom).toContain("restart");
    expect(broom).toContain("Start-Process powershell -WindowStyle Hidden");
    expect(broom.indexOf("Write-WatchdogHeartbeat -Status 'ok' -Event 'tick'")).toBeGreaterThan(
      broom.indexOf("if ($health.LastWriteTime -lt"),
    );
    expect(broom.indexOf("Write-WatchdogHeartbeat -Status 'restarting' -Event 'restart'")).toBeLessThan(
      broom.indexOf("Stop-ProcessTree -Roots $BotProcesses"),
    );
  });

  test("watchdog heartbeat script is dry-run capable and writes system heartbeat rows", () => {
    const packageJson = readFileSync("package.json", "utf8");
    const script = readFileSync("scripts/watchdog-heartbeat.ts", "utf8");

    expect(packageJson).toContain('"watchdog:heartbeat"');
    expect(script).toContain("upsertSystemHeartbeat");
    expect(script).toContain("getSystemHeartbeat");
    expect(script).toContain("loadLocalEnv");
    expect(script).toContain("--dry-run");
    expect(script).toContain("DATABASE_URL_DIRECT");
    expect(script).toContain("process.env.DATABASE_URL ?? process.env.DATABASE_URL_DIRECT");
    expect(script).toContain("skipped stale ok tick");
    expect(script).not.toContain("cwd:");
    expect(script).toContain("watchdog heartbeat");
  });

  test("dashboard health page surfaces local watchdog freshness", () => {
    const source = readFileSync("apps/dashboard/src/app/health/page.tsx", "utf8");

    expect(source).toContain('getSystemHeartbeat(db, "local-watchdog")');
    expect(source).toContain("watchdogFreshness");
    expect(source).toContain("Local watchdog");
  });
});
