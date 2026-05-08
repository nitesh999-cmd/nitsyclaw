import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard stream privacy", () => {
  it("keeps streaming chat search-capable when SERPER_API_KEY is configured", () => {
    const route = readFileSync("apps/dashboard/src/app/api/chat/stream/route.ts", "utf8");

    expect(route).toContain('from "@nitsyclaw/shared/search"');
    expect(route).toContain("makeSerperSearch(process.env.SERPER_API_KEY)");
  });

  it("does not stream raw tool input payloads to the browser", () => {
    const route = readFileSync("apps/dashboard/src/app/api/chat/stream/route.ts", "utf8");

    expect(route).not.toContain('send({ type: "tool", name: call.name, input: call.input });');
    expect(route).toContain('send({ type: "tool", name: call.name });');
  });

  it("does not feed raw tool validation errors back into the LLM-visible transcript", () => {
    const route = readFileSync("apps/dashboard/src/app/api/chat/stream/route.ts", "utf8");

    expect(route).toContain('throw new Error("Invalid tool input")');
    expect(route).toContain("safeToolError");
    expect(route).toContain("redactAuditString");
    expect(route).toContain('toolResultParts.push(`[tool ${call.name}] error: Tool failed.`)');
    expect(route).toContain('toolResultParts.push(`[tool ${call.name}] error: Tool unavailable.`)');
    expect(route).not.toContain("parsed.error.message");
    expect(route).not.toContain("e instanceof Error ? e.message : String(e)");
    expect(route).not.toContain("toolResultParts.push(`[tool ${call.name}] error: ${err}`)");
    expect(route).not.toContain("unknown tool:");
  });
});
