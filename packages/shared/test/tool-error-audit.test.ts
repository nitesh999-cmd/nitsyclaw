import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runAgent } from "../src/agent/loop.js";
import { ToolRegistry } from "../src/agent/tools.js";
import { classifyToolError, extractSqlState, TOOL_ERROR_CLASSES } from "../src/agent/tool-error.js";
import { registerWebResearch } from "../src/features/08-web-research.js";
import { createVerifiedSourceCollector } from "../src/search/verified-sources.js";
import { makeAgentDeps, makeFakeLiveResearcher } from "./helpers.js";
import type { AgentDeps } from "../src/agent/deps.js";

/** Everything a hostile error might carry. None may reach audit_log. */
const HOSTILE_MESSAGE = [
  "Failed query: insert into \"messages\" (\"body\") values ($1)",
  "while fetching https://profile.example.com/story-a",
  "for query 'world news today'",
  "recalled memory: Nitesh asked about the Geneva talks",
  "email body: please confirm the invoice",
  "owner +61430008008 lid 12345@lid",
  "request_id req_abc123",
  "encrypted_content ENCRYPTED-BLOB",
  "authorization Bearer sk-ant-secret",
  "123 Example Street, Melbourne",
].join(" | ");

const FORBIDDEN = [
  "Failed query", "insert into", "https://", "profile.example.com", "world news today",
  "recalled memory", "Geneva talks", "email body", "invoice", "+61430008008", "12345@lid",
  "req_abc123", "ENCRYPTED-BLOB", "sk-ant-secret", "Example Street",
];

function hostileError(): Error {
  const driver = Object.assign(new Error("driver: " + HOSTILE_MESSAGE), { code: "25006" });
  const mid = Object.assign(new Error("pool: " + HOSTILE_MESSAGE), { cause: driver });
  return Object.assign(new Error(HOSTILE_MESSAGE), { cause: mid });
}

function llmCalling(name: string, input: Record<string, unknown>) {
  let called = false;
  return {
    async complete() { return { text: "ok" }; },
    async toolStep() {
      if (called) return { stopReason: "end_turn" as const, toolCalls: [], text: "done" };
      called = true;
      return { stopReason: "tool_use" as const, toolCalls: [{ id: "c1", name, input }], text: "" };
    },
  };
}

async function runWith(registry: ToolRegistry, deps: AgentDeps, name: string, input: Record<string, unknown> = { query: "world news today" }) {
  const result = await runAgent({
    userPhone: "+61400000000",
    userMessage: "Give me three verified world news headlines from today, with sources.",
    systemPrompt: "test",
    registry,
    deps: { ...deps, llm: llmCalling(name, input) },
  });
  const rows = (deps.db as { __state: { audit_log: Array<Record<string, unknown>> } }).__state.audit_log;
  return { result, rows };
}

function throwingTool(name: string, extra: Partial<Parameters<ToolRegistry["register"]>[0]> = {}) {
  const registry = new ToolRegistry();
  registry.register({
    name,
    description: "throws a hostile error",
    inputSchema: z.object({ query: z.string() }),
    handler: async () => { throw hostileError(); },
    ...extra,
  });
  return registry;
}

describe("hostile tool error", () => {
  it("persists none of the prose, URLs, queries, identifiers, SQL or credentials", async () => {
    const deps = makeAgentDeps();

    const { rows } = await runWith(throwingTool("hostile_tool"), deps, "hostile_tool");

    const serialized = JSON.stringify(rows);
    for (const needle of FORBIDDEN) {
      expect(serialized, needle).not.toContain(needle);
    }
  });

  it("records only the approved structured error fields", async () => {
    const deps = makeAgentDeps();

    const { rows } = await runWith(throwingTool("hostile_tool"), deps, "hostile_tool");

    const row = rows.find((r) => r.tool === "hostile_tool")!;
    expect(row.success).toBe(false);
    expect(row.error).toBe("tool_error");
    expect(row.input).toEqual({});
    // Validated SQLSTATE survives as a bare code; nothing else does.
    expect(row.output).toEqual({ errorClass: "tool_error", sqlState: "25006" });
  });

  it("still hands the runtime the sanitized error and keeps user-facing failure behaviour", async () => {
    const deps = makeAgentDeps();

    const { result } = await runWith(throwingTool("hostile_tool"), deps, "hostile_tool");

    const call = result.toolCalls[0]!;
    expect(call.success).toBe(false);
    // The loop still surfaces an error string to the caller and the model.
    expect(typeof call.error).toBe("string");
    expect(call.error!.length).toBeGreaterThan(0);
    expect(result.rounds).toBeGreaterThan(0);
  });
});

describe("error projections", () => {
  it("records an allowlisted class and code and nothing else", async () => {
    const deps = makeAgentDeps();
    const registry = throwingTool("classified_tool", {
      errorProjection: () => ({ errorClass: "rate_limited", errorCode: "provider_throttled" }),
    });

    const { rows } = await runWith(registry, deps, "classified_tool");

    const row = rows.find((r) => r.tool === "classified_tool")!;
    expect(row.output).toEqual({ errorClass: "rate_limited", errorCode: "provider_throttled", sqlState: "25006" });
    expect(row.error).toBe("rate_limited");
    expect(JSON.stringify(rows)).not.toContain("Failed query");
  });

  it("falls back to tool_error when a projection returns values outside the allowlist", async () => {
    const deps = makeAgentDeps();
    const registry = throwingTool("sneaky_tool", {
      errorProjection: () => ({
        errorClass: "https://profile.example.com/story-a",
        errorCode: "Failed query: insert into messages",
      }),
    });

    const { rows } = await runWith(registry, deps, "sneaky_tool");

    const row = rows.find((r) => r.tool === "sneaky_tool")!;
    expect(row.output).toEqual({ errorClass: "tool_error", sqlState: "25006" });
    expect(JSON.stringify(rows)).not.toContain("profile.example.com");
  });

  it("falls back to tool_error when a projection throws", async () => {
    const deps = makeAgentDeps();
    const registry = throwingTool("broken_tool", {
      errorProjection: () => { throw new Error(HOSTILE_MESSAGE); },
    });

    const { rows } = await runWith(registry, deps, "broken_tool");

    const row = rows.find((r) => r.tool === "broken_tool")!;
    expect(row.output).toEqual({ errorClass: "tool_error", sqlState: "25006" });
    expect(JSON.stringify(rows)).not.toContain("Geneva talks");
  });

  it("records unknown_tool without the call input", async () => {
    const deps = makeAgentDeps();

    const { rows } = await runWith(new ToolRegistry(), deps, "no_such_tool");

    expect(rows[0]!.error).toBe("unknown_tool");
    expect(rows[0]!.output).toEqual({ errorClass: "unknown_tool" });
    expect(rows[0]!.input).toEqual({});
    expect(JSON.stringify(rows)).not.toContain("world news today");
  });
});

describe("classifyToolError", () => {
  it("defaults to tool_error and omits sqlState when there is none", () => {
    expect(classifyToolError(undefined, {}, new Error("plain"))).toEqual({ errorClass: "tool_error" });
  });

  it("accepts every declared class", () => {
    for (const cls of TOOL_ERROR_CLASSES) {
      expect(classifyToolError(() => ({ errorClass: cls }), {}, new Error("x")).errorClass).toBe(cls);
    }
  });

  it("rejects codes that could carry free text", () => {
    for (const code of ["has space", "Has-Caps", "https://x.example.com", "a".repeat(41), ""]) {
      expect(classifyToolError(() => ({ errorCode: code }), {}, new Error("x")).errorCode).toBeUndefined();
    }
  });

  it("carries a validated SQLSTATE but never the SQL around it", () => {
    const audit = classifyToolError(undefined, {}, hostileError());

    expect(audit.sqlState).toBe("25006");
    expect(JSON.stringify(audit)).not.toContain("insert into");
  });

  it("ignores Node runtime codes that merely look like SQLSTATEs", () => {
    expect(extractSqlState(Object.assign(new Error("x"), { code: "EPIPE" }))).toBeUndefined();
    expect(extractSqlState(Object.assign(new Error("x"), { code: "EBUSY" }))).toBeUndefined();
  });
});

describe("unchanged behaviour", () => {
  it("keeps web_research failure output and its sanitized failureCode", async () => {
    const deps = makeAgentDeps({
      verifiedSources: createVerifiedSourceCollector(),
      liveResearch: makeFakeLiveResearcher({
        status: "unavailable", answer: "", sources: [], claims: [], failureCode: "rate_limited",
      }),
    });
    const registry = new ToolRegistry();
    registerWebResearch(registry);

    const { result, rows } = await runWith(registry, deps, "web_research");

    // Runtime result unchanged: the model still sees the honest message.
    const out = result.toolCalls[0]!.output as { available: boolean; failureCode: string; message: string };
    expect(out.available).toBe(false);
    expect(out.failureCode).toBe("rate_limited");
    expect(out.message).toContain("rate limited");

    // Audit keeps the 752f50f success-path projection: approved scalars only.
    const row = rows.find((r) => r.tool === "web_research")!;
    expect(row.success).toBe(true);
    expect(Object.keys(row.output as object).sort()).toEqual([
      "answerLen", "available", "failureCode", "searchesUsed", "sourceCount", "status",
    ]);
    expect(row.output).toMatchObject({ available: false, failureCode: "rate_limited" });
  });

  it("keeps the successful auditProjection behaviour from 752f50f", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "safe_tool",
      description: "safe projection",
      inputSchema: z.object({ query: z.string() }),
      handler: async () => ({ secretBody: "Geneva talks", itemCount: 3 }),
      auditProjection: ({ output }) => ({ input: {}, output: { itemCount: (output as { itemCount: number }).itemCount } }),
    });
    const deps = makeAgentDeps();

    const { rows } = await runWith(registry, deps, "safe_tool");

    const row = rows.find((r) => r.tool === "safe_tool")!;
    expect(row.output).toEqual({ itemCount: 3 });
    expect(JSON.stringify(rows)).not.toContain("Geneva talks");
  });
});
