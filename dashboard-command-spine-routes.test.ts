import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard command execution spine", () => {
  test("chat routes create a durable command job and expose a receipt event", () => {
    const chatRoute = readFileSync("apps/dashboard/src/app/api/chat/route.ts", "utf8");
    const streamRoute = readFileSync("apps/dashboard/src/app/api/chat/stream/route.ts", "utf8");

    expect(chatRoute).toContain("createCommandJob");
    expect(chatRoute).toContain("commandJob");
    expect(chatRoute).toContain("receiptText");
    expect(streamRoute).toContain("createCommandJob");
    expect(streamRoute).toContain('type: "receipt"');
    expect(streamRoute).toContain("commandJob.receiptText");
  });
});
