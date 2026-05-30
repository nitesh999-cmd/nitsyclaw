import { describe, expect, it } from "vitest";
import { buildAgentRunLogEntry } from "./agent-run-log";

describe("agent run log", () => {
  it("creates redacted inspectable run entries", () => {
    const entry = buildAgentRunLogEntry({
      operation: "operator_runner.complete",
      inputSummary: "Fix issue for nitesh@example.com using postgres://user:pass@host/db",
      decisions: ["ship safe local route"],
      filesTouched: ["apps/bot/src/router.ts"],
      commandsRun: ["pnpm test"],
      verification: ["tests passed"],
      result: "done",
      startedAt: new Date("2026-05-31T00:00:00Z"),
      completedAt: new Date("2026-05-31T00:01:00Z"),
    });

    expect(entry.status).toBe("passed");
    expect(entry.inputSummary).toContain("[redacted:email]");
    expect(entry.inputSummary).toContain("[redacted:database-url]");
    expect(entry.filesTouched).toEqual(["apps/bot/src/router.ts"]);
    expect(entry.commandsRun).toEqual(["pnpm test"]);
  });

  it("marks entries with errors as failed", () => {
    const entry = buildAgentRunLogEntry({
      operation: "operator_runner.verify",
      inputSummary: "Run release gate",
      errors: ["pnpm build exited with 1"],
      result: "failed",
    });

    expect(entry.status).toBe("failed");
  });
});
