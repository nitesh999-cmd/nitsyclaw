import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("bot safe user-facing errors", () => {
  test("router logs raw errors server-side instead of sending them to WhatsApp", () => {
    const source = readFileSync("apps/bot/src/router.ts", "utf8");

    expect(source).toContain("sendPublicFailure");
    expect(source).toContain("logBotError");
    expect(source).not.toContain("console.error");
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

  test("bot boot failure paths use redacted logging", () => {
    const source = readFileSync("apps/bot/src/index.ts", "utf8");

    expect(source).toContain("logBotError");
    expect(source).not.toContain('console.error("[boot] whatsapp status heartbeat failed"');
    expect(source).not.toContain('console.error("[boot] loop guard heartbeat failed"');
    expect(source).not.toContain('console.error("[boot] loop guard audit failed"');
    expect(source).not.toContain('console.error("[boot] loop guard feature request failed"');
    expect(source).not.toContain('console.error("[boot] loop guard notify failed"');
    expect(source).not.toContain('console.error("[boot] loop guard reset heartbeat failed"');
    expect(source).not.toContain('console.error("[boot] shutdown failed"');
    expect(source).not.toContain('console.error("[boot] fatal"');
  });

  test("WhatsApp presence and send monitor failures use redacted logging", () => {
    const presence = readFileSync("apps/bot/src/whatsapp-presence.ts", "utf8");
    const sendMonitor = readFileSync("apps/bot/src/whatsapp-send-monitor.ts", "utf8");

    expect(presence).toContain("logBotError");
    expect(presence).not.toContain('console.error("[wwebjs] presence unavailable failed"');
    expect(sendMonitor).toContain("formatSafeLogError");
    expect(sendMonitor).toContain("logBotError");
    expect(sendMonitor).not.toContain('console.error("[whatsapp-send-monitor]');
  });
});
