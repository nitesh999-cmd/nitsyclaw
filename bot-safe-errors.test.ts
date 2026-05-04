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
});
