import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("bot safe user-facing errors", () => {
  test("router logs raw errors server-side instead of sending them to WhatsApp", () => {
    const source = readFileSync("apps/bot/src/router.ts", "utf8");

    expect(source).toContain("sendPublicFailure");
    expect(source).toContain("console.error");
    expect(source).not.toContain("(e as Error).message");
    expect(source).not.toContain("(e2 as Error).message");
    expect(source).not.toContain("(locationError as Error).message");
    expect(source).not.toContain("(bugError as Error).message");
    expect(source).not.toContain("(queueError as Error).message");
  });

  test("email and calendar adapters use redacted bot logging", () => {
    const source = readFileSync("apps/bot/src/adapters.ts", "utf8");

    expect(source).toContain("logBotError");
    expect(source).not.toContain('console.error("[email]');
    expect(source).not.toContain('console.error("[cal]');
  });

  test("Microsoft Graph and notification failures avoid raw provider error logs", () => {
    const graph = readFileSync("apps/bot/src/microsoft-graph.ts", "utf8");
    const notify = readFileSync("apps/bot/src/notify-all.ts", "utf8");

    expect(graph).toContain("logBotError");
    expect(graph).not.toContain("await resp.text()");
    expect(graph).not.toContain('console.error("[ms-graph]');
    expect(notify).toContain("logBotError");
    expect(notify).not.toContain('console.error("[notify');
  });

  test("scheduler uses redacted errors in logs and heartbeat metadata", () => {
    const source = readFileSync("apps/bot/src/scheduler.ts", "utf8");

    expect(source).toContain("logBotError");
    expect(source).toContain("formatSafeLogError");
    expect(source).not.toContain('console.error("[cron:');
    expect(source).not.toContain("e instanceof Error ? e.message : String(e)");
  });

  test("Microsoft auth does not print raw OAuth response bodies", () => {
    const source = readFileSync("apps/bot/src/microsoft-auth.ts", "utf8");

    expect(source).not.toContain("await resp.text()");
    expect(source).not.toContain("await codeResp.text()");
    expect(source).not.toContain("JSON.stringify(pollData)");
    expect(source).not.toContain("console.error(e)");
  });

  test("build agent notification failures use redacted logging", () => {
    const source = readFileSync("apps/bot/src/build-agent.ts", "utf8");

    expect(source).toContain("logBotError");
    expect(source).not.toContain('console.error("[build-agent]');
  });
});
