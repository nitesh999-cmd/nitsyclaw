// Integration test for the agent loop. Uses a fake LLM that issues a tool call
// and then ends the turn. Verifies tool dispatch, audit logging, error paths.

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runAgent } from "../src/agent/loop.js";
import { ToolRegistry } from "../src/agent/tools.js";
import { fakeLlmWithToolCall, makeAgentDeps } from "./helpers.js";

describe("runAgent", () => {
  it("dispatches tool calls and returns final text", async () => {
    const r = new ToolRegistry();
    let called: any = null;
    r.register({
      name: "echo",
      description: "echo input",
      inputSchema: z.object({ msg: z.string() }),
      handler: async (input: { msg: string }) => {
        called = input;
        return { ok: true, msg: input.msg };
      },
    });

    const deps = makeAgentDeps({ llm: fakeLlmWithToolCall("echo", { msg: "hello" }) });
    const result = await runAgent({
      userPhone: "+9100",
      userMessage: "say hi",
      systemPrompt: "test",
      registry: r,
      deps,
    });
    expect(called).toEqual({ msg: "hello" });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].success).toBe(true);
    expect(result.rounds).toBe(2);
  });

  it("redacts sensitive tool audit payloads before persistence", async () => {
    const r = new ToolRegistry();
    r.register({
      name: "send_email",
      description: "send email",
      inputSchema: z.object({
        to: z.string(),
        body: z.string(),
        accessToken: z.string(),
      }),
      handler: async () => ({
        ok: true,
        phone: "+61430008008",
        refresh_token: "refresh-secret",
        content: "private reply body",
      }),
    });

    const deps = makeAgentDeps({
      llm: fakeLlmWithToolCall("send_email", {
        to: "person@example.com",
        body: "private email body",
        accessToken: "token-secret",
      }),
    });
    await runAgent({
      userPhone: "+9100",
      userMessage: "send this",
      systemPrompt: "test",
      registry: r,
      deps,
    });

    const auditState = deps.db as { __state?: { audit_log?: unknown[] } };
    const auditText = JSON.stringify(auditState.__state?.audit_log ?? []);
    expect(auditText).not.toContain("person@example.com");
    expect(auditText).not.toContain("private email body");
    expect(auditText).not.toContain("token-secret");
    expect(auditText).not.toContain("+61430008008");
    expect(auditText).not.toContain("refresh-secret");
    expect(auditText).not.toContain("private reply body");
    expect(auditText).toContain("[redacted");
  });

  it("captures tool errors and continues", async () => {
    const r = new ToolRegistry();
    r.register({
      name: "boom",
      description: "always fails",
      inputSchema: z.object({}),
      handler: async () => {
        throw new Error("nope");
      },
    });
    const deps = makeAgentDeps({ llm: fakeLlmWithToolCall("boom", {}) });
    const result = await runAgent({
      userPhone: "+9100",
      userMessage: "x",
      systemPrompt: "x",
      registry: r,
      deps,
    });
    expect(result.toolCalls[0].success).toBe(false);
    expect(result.toolCalls[0].error).toBe("nope");
  });

  it("handles unknown tool name gracefully", async () => {
    const r = new ToolRegistry();
    const deps = makeAgentDeps({ llm: fakeLlmWithToolCall("does-not-exist", {}) });
    const result = await runAgent({
      userPhone: "+9100",
      userMessage: "x",
      systemPrompt: "x",
      registry: r,
      deps,
    });
    expect(result.toolCalls[0].success).toBe(false);
    expect(result.toolCalls[0].error).toMatch(/unknown tool/);
  });

  it("respects maxRounds cap", async () => {
    const r = new ToolRegistry();
    r.register({
      name: "loop",
      description: "infinite",
      inputSchema: z.object({}),
      handler: async () => ({}),
    });
    const llm = {
      async complete() { return { text: "" }; },
      async toolStep() {
        return {
          stopReason: "tool_use" as const,
          toolCalls: [{ id: "1", name: "loop", input: {} }],
          text: "looping",
        };
      },
    };
    const deps = makeAgentDeps({ llm });
    const result = await runAgent({
      userPhone: "+9100",
      userMessage: "x",
      systemPrompt: "x",
      registry: r,
      deps,
      maxRounds: 3,
    });
    expect(result.rounds).toBe(3);
    expect(result.finalText).toContain("max rounds");
  });
});
