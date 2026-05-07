import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { AgentDeps } from "./deps.js";
import { formatToolErrorText, runAgent } from "./loop.js";
import { ToolRegistry } from "./tools.js";

vi.mock("../db/repo.js", async () => {
  const actual = await vi.importActual<typeof import("../db/repo.js")>("../db/repo.js");
  return {
    ...actual,
    logAudit: vi.fn(async () => {}),
  };
});

describe("agent loop error safety", () => {
  it("redacts tool failures before returning them or feeding them back to the model", async () => {
    const secondRoundMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
    const registry = new ToolRegistry().register({
      name: "dangerous_tool",
      description: "test tool",
      inputSchema: z.object({ value: z.string() }),
      handler: async () => {
        throw new Error("failed for nitesh@example.com +61 430 008 008 sk_live_secret123456789");
      },
    });
    const deps = {
      db: {},
      now: () => new Date("2026-05-07T00:00:00.000Z"),
      timezone: "Australia/Melbourne",
      llm: {
        complete: vi.fn(),
        toolStep: vi
          .fn()
          .mockResolvedValueOnce({
            stopReason: "tool_use",
            toolCalls: [{ id: "1", name: "dangerous_tool", input: { value: "x" } }],
            text: "Using a tool.",
          })
          .mockImplementationOnce(async ({ messages }) => {
            secondRoundMessages.push(...messages);
            return { stopReason: "end_turn", toolCalls: [], text: "I could not finish that safely." };
          }),
      },
    } as unknown as AgentDeps;

    const result = await runAgent({
      userPhone: "+61430008008",
      userMessage: "run it",
      systemPrompt: "test",
      registry,
      deps,
    });

    expect(result.toolCalls[0]?.error).toContain("[redacted:email]");
    expect(result.toolCalls[0]?.error).toContain("[redacted:phone]");
    expect(result.toolCalls[0]?.error).toContain("[redacted:token]");
    expect(JSON.stringify(result.toolCalls)).not.toContain("nitesh@example.com");
    expect(JSON.stringify(result.toolCalls)).not.toContain("+61 430 008 008");
    expect(JSON.stringify(result.toolCalls)).not.toContain("sk_live");
    expect(JSON.stringify(secondRoundMessages)).not.toContain("nitesh@example.com");
    expect(JSON.stringify(secondRoundMessages)).not.toContain("+61 430 008 008");
    expect(JSON.stringify(secondRoundMessages)).not.toContain("sk_live");
  });

  it("caps long tool errors", () => {
    const message = formatToolErrorText(`x${"a".repeat(500)}`);

    expect(message.length).toBeLessThanOrEqual(254);
    expect(message).toContain("[truncated]");
  });
});
