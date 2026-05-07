import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard stream privacy", () => {
  it("does not stream raw tool input payloads to the browser", () => {
    const route = readFileSync("apps/dashboard/src/app/api/chat/stream/route.ts", "utf8");

    expect(route).not.toContain('send({ type: "tool", name: call.name, input: call.input });');
    expect(route).toContain('send({ type: "tool", name: call.name });');
  });
});
