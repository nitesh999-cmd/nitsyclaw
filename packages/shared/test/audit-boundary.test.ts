import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  auditDataDelete,
  auditLoopBreaker,
  auditModelRoute,
  auditOperatorComplete,
  auditOperatorDecision,
  auditOperatorVerify,
  auditRecoveryAction,
  auditToolFailure,
  auditToolSuccess,
  auditUnknownTool,
  auditWebPresearch,
  auditWebResearchFallback,
  loopBreakerReasonCode,
} from "../src/db/audit-contract.js";
import { projectForAudit } from "../src/agent/loop.js";
import { classifyToolError } from "../src/agent/tool-error.js";
import { buildModelRouteAuditPayload } from "../src/local-brain/telemetry-audit.js";
import type { RoutingTelemetryEvent } from "../src/local-brain/types.js";
import type { ToolDefinition } from "../src/agent/tools.js";

/**
 * Runtime values that must never reach `audit_log`: a query, a page title, an
 * answer body, a URL, recalled memory, an email address, a phone number, a LID,
 * an owner hash, a session id, a SQL statement and a credential.
 */
const HOSTILE = [
  "who won the grand final last night",
  "Breaking: markets tumble after surprise decision",
  "https://news.example.com/article/12345?utm=abc",
  "nitesh@example.com",
  "+61430008008",
  "12345678901234@lid",
  "9f2c1b7a4e8d6f3021c5ab97de4410f8b2c6d9e7a1f30b8c2d4e6f8a0b1c3d5e",
  "sess_abc123456789",
  "select * from memories where owner_hash = 'abc'",
  "sk-ant-api03-do-not-persist",
  "Remember that my passport expires in March.",
];

function containsHostile(entry: unknown, label: string): void {
  const serialized = JSON.stringify(entry);
  for (const value of HOSTILE) {
    expect(serialized, `${label} leaked ${value.slice(0, 24)}`).not.toContain(value);
  }
}

const toolWithoutProjection = { name: "no_projection_tool" } as unknown as ToolDefinition;

const toolWithProjection = {
  name: "web_research",
  auditProjection: ({ output }: { input: unknown; output: unknown }) => {
    const out = output as { status?: string; sources?: unknown[]; answer?: string } | undefined;
    return {
      input: {},
      output: {
        status: out?.status ?? "unavailable",
        available: out !== undefined,
        searchesUsed: 1,
        sourceCount: out?.sources?.length ?? 0,
        answerLen: out?.answer?.length ?? 0,
        failureCode: null,
      },
    };
  },
} as unknown as ToolDefinition;

// ---------------------------------------------------------------------------

describe("tool call audit entries", () => {
  it("persists a tool's own projection on success", () => {
    const runtimeResult = {
      status: "ok",
      answer: HOSTILE[1],
      sources: [{ title: HOSTILE[1], url: HOSTILE[2] }],
    };

    const entry = auditToolSuccess({
      tool: toolWithProjection.name,
      projected: projectForAudit(toolWithProjection, { query: HOSTILE[0] }, runtimeResult),
      durationMs: 1200,
    });

    expect(entry.input).toEqual({});
    expect(Object.keys(entry.output).sort()).toEqual([
      "answerLen",
      "available",
      "failureCode",
      "searchesUsed",
      "sourceCount",
      "status",
    ]);
    expect(entry.output.sourceCount).toBe(1);
    expect(entry.output.answerLen).toBe(HOSTILE[1]!.length);
    expect(entry.success).toBe(true);
    expect(entry.durationMs).toBe(1200);
    containsHostile(entry, "web_research success");
    // The runtime result itself is untouched — the model still gets everything.
    expect(runtimeResult.answer).toBe(HOSTILE[1]);
    expect(runtimeResult.sources).toHaveLength(1);
  });

  it("persists empty input and output for a tool with no projection", () => {
    const entry = auditToolSuccess({
      tool: toolWithoutProjection.name,
      projected: projectForAudit(toolWithoutProjection, { query: HOSTILE[0] }, { answer: HOSTILE[1] }),
      durationMs: 5,
    });

    expect(entry.input).toEqual({});
    expect(entry.output).toEqual({});
    containsHostile(entry, "unprojected tool");
  });

  it("persists empty input and output when a projection throws", () => {
    const throwing = {
      name: "throwing_tool",
      auditProjection: () => {
        throw new Error(HOSTILE[8]);
      },
    } as unknown as ToolDefinition;

    const entry = auditToolSuccess({
      tool: throwing.name,
      projected: projectForAudit(throwing, { query: HOSTILE[0] }, { answer: HOSTILE[1] }),
      durationMs: 5,
    });

    expect(entry.input).toEqual({});
    expect(entry.output).toEqual({});
    containsHostile(entry, "throwing projection");
  });

  it("reduces a hostile failure to a closed class, with no message, stack or cause", () => {
    const cause = new Error(HOSTILE[9]);
    const error = Object.assign(new Error(`Failed query: ${HOSTILE[8]}`), { cause });

    const entry = auditToolFailure({
      tool: toolWithProjection.name,
      projectedInput: projectForAudit(toolWithProjection, { query: HOSTILE[0] }, undefined).input,
      errorAudit: classifyToolError(undefined, { query: HOSTILE[0] }, error),
      durationMs: 30,
    });

    expect(entry.input).toEqual({});
    expect(entry.output).toEqual({ errorClass: "tool_error" });
    expect(entry.error).toBe("tool_error");
    expect(entry.success).toBe(false);
    containsHostile(entry, "hostile tool error");
  });

  it("rejects an errorCode outside the allowlist while keeping a real SQLSTATE", () => {
    const driverError = Object.assign(new Error("Failed query"), {
      cause: Object.assign(new Error(HOSTILE[8]), { code: "23505" }),
    });

    const entry = auditToolFailure({
      tool: "memory_search",
      projectedInput: {},
      errorAudit: classifyToolError(
        () => ({ errorClass: "database_error", errorCode: `memory_${HOSTILE[7]}` }),
        {},
        driverError,
      ),
      durationMs: 12,
    });

    expect(entry.output).toEqual({ errorClass: "database_error", sqlState: "23505" });
    expect(entry.output).not.toHaveProperty("errorCode");
    containsHostile(entry, "unlisted error code");
  });

  it("records an unknown tool without its model-supplied name, input or error prose", () => {
    const entry = auditUnknownTool();

    expect(entry.tool).toBe("unknown_tool");
    expect(entry.input).toEqual({});
    expect(entry.output).toEqual({ errorClass: "unknown_tool" });
    expect(entry.error).toBe("unknown_tool");
    // A name the model invented can carry an instruction or an identifier.
    expect(JSON.stringify(entry)).not.toContain("exfiltrate_owner_9f2c1b7a");
  });
});

// ---------------------------------------------------------------------------

describe("web research audit entries", () => {
  it("preserves the six-scalar web_presearch projection", () => {
    const entry = auditWebPresearch({
      surface: "whatsapp",
      status: "ok",
      available: true,
      searchesUsed: 3,
      sourceCount: 4,
      answerLen: 812,
      failureCode: null,
      elapsedMs: 9100,
      remainingBudget: 2,
    });

    expect(entry.input).toEqual({ surface: "whatsapp" });
    expect(entry.output).toEqual({
      status: "ok",
      available: true,
      searchesUsed: 3,
      sourceCount: 4,
      answerLen: 812,
      failureCode: null,
      elapsedMs: 9100,
      remainingBudget: 2,
    });
    expect(entry.success).toBe(true);
    containsHostile(entry, "web_presearch");
  });

  it("preserves the web_research_fallback scalar projection", () => {
    const entry = auditWebResearchFallback({
      sourceCount: 4,
      answerLen: 812,
      searchesUsed: 3,
      elapsedMs: 45000,
      timeoutCode: "timeout",
    });

    expect(entry.input).toEqual({});
    expect(entry.output).toEqual({
      fallbackType: "verified_presearch_answer",
      sourceCount: 4,
      answerLen: 812,
      searchesUsed: 3,
      elapsedMs: 45000,
      timeoutCode: "timeout",
    });
    containsHostile(entry, "web_research_fallback");
  });
});

// ---------------------------------------------------------------------------

describe("model_route audit entry", () => {
  const event: RoutingTelemetryEvent = {
    at: "2026-07-29T13:19:40.000Z",
    route: "local",
    mode: "auto",
    reasonCode: "private_everyday_local_default",
    model: "qwen3:8b",
    latencyMs: 18159,
    success: true,
    fallback: false,
    requestClass: "read_only_investigation",
    sensitivity: "private",
  };

  it("keeps the exact key sets from the shared builder", () => {
    const entry = auditModelRoute(buildModelRouteAuditPayload(event));

    expect(Object.keys(entry.input).sort()).toEqual(["mode", "reason", "requestClass", "sensitivity"]);
    expect(Object.keys(entry.output).sort()).toEqual(["fallback", "model", "route"]);
    expect(entry.actor).toBe("model-router");
    expect(entry.tool).toBe("model_route");
  });

  it("persists no ownerHash even when the event carries one", () => {
    const entry = auditModelRoute(
      buildModelRouteAuditPayload({ ...event, ownerHash: HOSTILE[6] } as RoutingTelemetryEvent),
    );

    expect(JSON.stringify(entry)).not.toContain("ownerHash");
    containsHostile(entry, "model_route");
  });
});

// ---------------------------------------------------------------------------

describe("whatsapp_loop_breaker audit entry", () => {
  it("maps every proven trip branch to a closed reason code", () => {
    // Exactly the two strings WhatsAppLoopBreaker.trip() is called with.
    expect(loopBreakerReasonCode("send burst: 9 sends in 60000ms")).toBe("send_burst");
    expect(loopBreakerReasonCode("inbound matched recent outbound")).toBe("inbound_echo_match");
  });

  it("collapses any unrecognised reason to a generic token", () => {
    for (const value of [...HOSTILE, "", undefined, null, 42, {}]) {
      expect(loopBreakerReasonCode(value)).toBe("unknown_reason");
    }
  });

  it("never persists the reason string, only its code", () => {
    const entry = auditLoopBreaker({ reason: `send burst: 9 sends in 60000ms from ${HOSTILE[4]}` });

    expect(entry.input).toEqual({ reasonCode: "send_burst", cooldown: false });
    expect(entry.output).toEqual({ action: "paused_whatsapp_replies" });
    expect(JSON.stringify(entry)).not.toContain("9 sends");
    containsHostile(entry, "loop_breaker");
  });

  it("puts only an approved class token in the error column", () => {
    for (const reason of HOSTILE) {
      expect(auditLoopBreaker({ reason }).error).toBe("loop_breaker_tripped");
    }
  });

  it("records a cooldown with a validated timestamp and drops an invalid one", () => {
    const cooling = auditLoopBreaker({
      reason: "inbound matched recent outbound",
      resetAt: "2026-07-29T13:25:00.000Z",
    });
    expect(cooling.input).toEqual({ reasonCode: "inbound_echo_match", cooldown: true });
    expect(cooling.output).toEqual({
      action: "cooldown_whatsapp_replies",
      resetAt: "2026-07-29T13:25:00.000Z",
    });

    const bogus = auditLoopBreaker({ reason: "inbound matched recent outbound", resetAt: HOSTILE[2] });
    expect(bogus.output).toEqual({ action: "paused_whatsapp_replies" });
    containsHostile(bogus, "loop_breaker resetAt");
  });
});

// ---------------------------------------------------------------------------

describe("whatsapp_recovery_action audit entry", () => {
  it("persists only the closed action, a constant boolean and a fixed marker", () => {
    const entry = auditRecoveryAction({ action: "railway_restarted", durationMs: 4 });

    expect(entry.input).toEqual({ action: "railway_restarted" });
    expect(entry.output).toEqual({ recorded: true, proof: "manual_operator_marker" });
    expect(entry.success).toBe(true);
    expect(entry.durationMs).toBe(4);
  });

  it("keeps proof a fixed token that no caller can influence", () => {
    const entry = auditRecoveryAction({ action: "phone_proof_started", durationMs: Number.NaN });

    expect(entry.output.proof).toBe("manual_operator_marker");
    expect(entry).not.toHaveProperty("durationMs");
  });
});

// ---------------------------------------------------------------------------

describe("data_delete audit entry", () => {
  const SNAPSHOT = "3f7a1c2e-9b04-4d61-8f2a-5c6d7e8f9a0b";

  it("persists the scope, a validated snapshot id and row counts only", () => {
    const entry = auditDataDelete({
      scope: "everything",
      exportSnapshotId: SNAPSHOT,
      deleted: { memories: 412, messages: 9310, auditLog: 53 },
      durationMs: 640,
    });

    expect(entry.input).toEqual({ scope: "everything", exportSnapshotId: SNAPSHOT });
    expect(entry.output).toEqual({ deleted: { memories: 412, messages: 9310, auditLog: 53 } });
    expect(entry.actor).toBe("user");
  });

  it("drops a snapshot id supplied off a form field that is not a snapshot id", () => {
    for (const value of HOSTILE) {
      const entry = auditDataDelete({
        scope: "everything",
        exportSnapshotId: value,
        deleted: {},
        durationMs: 1,
      });
      expect(entry.input).toEqual({ scope: "everything" });
      containsHostile(entry, "data_delete snapshot");
    }
  });

  it("keeps only numeric row counts, never a value smuggled into the tally", () => {
    const entry = auditDataDelete({
      scope: "memories",
      deleted: { memories: 3, leaked: HOSTILE[10], alsoLeaked: { body: HOSTILE[1] } },
      durationMs: 5,
    });

    expect(entry.output).toEqual({ deleted: { memories: 3 } });
    containsHostile(entry, "data_delete counts");
  });
});

// ---------------------------------------------------------------------------

describe("operator_runner audit entries", () => {
  const JOB_ID = "3f7a1c2e-9b04-4d61-8f2a-5c6d7e8f9a0b";

  it("persists a claim as a job id, closed enums and a count", () => {
    const entry = auditOperatorDecision({
      event: "claim",
      jobId: JOB_ID,
      decision: "claim",
      nextStatus: "in_progress",
      commandCount: 4,
    });

    expect(entry.tool).toBe("operator_runner.claim");
    expect(entry.input).toEqual({ jobId: JOB_ID });
    expect(entry.output).toEqual({ decision: "claim", nextStatus: "in_progress", commandCount: 4 });
  });

  it("drops a job id that is not an operator queue UUID", () => {
    for (const value of HOSTILE) {
      const entry = auditOperatorDecision({
        event: "reject",
        jobId: value,
        decision: "reject",
        nextStatus: "rejected",
      });
      expect(entry.input).toEqual({});
      containsHostile(entry, "operator jobId");
    }
  });

  it("records a verify failure without the failing command, report path or summary", () => {
    const entry = auditOperatorVerify({
      jobId: JOB_ID,
      commandCount: 4,
      success: false,
      hasFailedCommand: true,
      durationMs: 8200,
    });

    expect(entry.input).toEqual({ jobId: JOB_ID, commandCount: 4 });
    expect(entry.output).toEqual({ success: false, hasFailedCommand: true });
    expect(entry.error).toBe("operator_command_failed");
    expect(entry.durationMs).toBe(8200);
  });

  it("omits the error column entirely when verify succeeded", () => {
    const entry = auditOperatorVerify({
      jobId: JOB_ID,
      commandCount: 1,
      success: true,
      hasFailedCommand: false,
      durationMs: 10,
    });

    expect(entry).not.toHaveProperty("error");
    expect(entry.success).toBe(true);
  });

  it("records completion presence flags rather than commit or deployment values", () => {
    const entry = auditOperatorComplete({
      jobId: JOB_ID,
      status: "done",
      hasCommit: true,
      hasDeployment: false,
    });

    expect(entry.input).toEqual({ jobId: JOB_ID });
    expect(entry.output).toEqual({ status: "done", hasCommit: true, hasDeployment: false });
  });
});

// ---------------------------------------------------------------------------
// Source inventory: the boundary only holds if every writer goes through it.
// ---------------------------------------------------------------------------

const APPROVED_BUILDERS = [
  "auditToolSuccess",
  "auditToolFailure",
  "auditUnknownTool",
  "auditModelRoute",
  "auditWebPresearch",
  "auditWebResearchFallback",
  "auditLoopBreaker",
  "auditRecoveryAction",
  "auditOperatorDecision",
  "auditOperatorVerify",
  "auditOperatorComplete",
  "auditDataDelete",
];

/**
 * Raw runtime data that must never appear in a call to `logAudit`.
 *
 * Scalars derived from runtime content — `answerLen`, `sourceCount`,
 * `commandCount` — are permitted and are the reason the builders type those
 * parameters as `number`: an array or a body cannot be passed where a number is
 * required, so the compiler covers what this scan deliberately does not.
 */
const FORBIDDEN_IN_CALL = [
  /\bcall\.input\b/,
  /\berror\.(message|stack|cause)\b/,
  /\bincident\.reason\b/,
  /\bownerHash\b/,
  /\bfailureSummary\b/,
  /\bfailedCommand\b(?!\s*!=)/,
  /\breportPath\b/,
  /\.answer\b(?!\.length)/,
  /\.sources\b(?!\.length)/,
  /\bJSON\.stringify\b/,
  /\.\.\./,
];

const SCAN_ROOTS = ["apps", "packages", "scripts"];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", ".wwebjs_cache", "test", "tests"]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * Every audit write in the repository, with the argument text that follows it.
 *
 * Two forms exist: the usual `logAudit(db, entry)`, and a direct
 * `insert(auditLog)` for the one writer that must land inside an existing
 * transaction. Both are scanned, so a direct insert cannot quietly become a
 * second, unguarded path.
 */
function auditCallSites(): Array<{ file: string; call: string }> {
  const sites: Array<{ file: string; call: string }> = [];
  for (const root of SCAN_ROOTS) {
    for (const file of sourceFiles(root)) {
      const src = readFileSync(file, "utf8");
      for (const marker of ["logAudit(", "insert(auditLog)"]) {
        let index = src.indexOf(marker);
        while (index !== -1) {
          // The persistence boundary's own definition and body are not call sites.
          const isBoundary =
            /export async function $/.test(src.slice(Math.max(0, index - 40), index)) ||
            file.endsWith(join("db", "repo.ts"));
          if (!isBoundary) sites.push({ file, call: src.slice(index, index + 500) });
          index = src.indexOf(marker, index + 1);
        }
      }
    }
  }
  return sites;
}

describe("audit_log writer inventory", () => {
  it("finds every writer in the repository", () => {
    const sites = auditCallSites();
    // A guard against the scan silently matching nothing.
    expect(sites.length).toBeGreaterThanOrEqual(15);
    // Including the one that inserts directly inside a transaction.
    expect(sites.some((site) => site.call.startsWith("insert(auditLog)"))).toBe(true);
  });

  it("every writer builds its payload with an approved contract builder", () => {
    for (const { file, call } of auditCallSites()) {
      const used = APPROVED_BUILDERS.some((builder) => call.includes(`${builder}(`));
      expect(used, `${file} calls logAudit without a contract builder`).toBe(true);
    }
  });

  it("no writer passes raw runtime data to the boundary", () => {
    for (const { file, call } of auditCallSites()) {
      // Bound the window to the call itself, not the surrounding function.
      const bounded = call.slice(0, call.indexOf(");") === -1 ? call.length : call.indexOf(");") + 2);
      // `projectForAudit` and `classifyToolError` are the two sanctioned
      // consumers of raw call input: they reduce it rather than persist it.
      // Everything else that reaches the boundary is scanned as written.
      const window = bounded
        .replace(/projectForAudit\(tool, call\.input, (out|undefined)\)(\.input)?/g, "<projected>")
        .replace(/classifyToolError\(tool\.errorProjection, call\.input, e\)/g, "<classified>");
      for (const token of FORBIDDEN_IN_CALL) {
        expect(window, `${file} passes ${token} to logAudit`).not.toMatch(token);
      }
    }
  });

  it("no source file forges a SafeAuditEntry with an unsafe cast", () => {
    for (const root of SCAN_ROOTS) {
      for (const file of sourceFiles(root)) {
        const src = readFileSync(file, "utf8");
        if (file.endsWith(join("db", "audit-contract.ts"))) continue;
        expect(src, `${file} casts to SafeAuditEntry`).not.toContain("as SafeAuditEntry");
      }
    }
  });

  it("both agent loops project tool calls through the same shared machinery", () => {
    const loops = ["packages/shared/src/agent/loop.ts", "apps/dashboard/src/app/api/chat/stream/route.ts"];
    for (const file of loops) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toContain("projectForAudit(tool, call.input, out)");
      expect(src, file).toContain("projectForAudit(tool, call.input, undefined).input");
      expect(src, file).toContain("classifyToolError(tool.errorProjection, call.input, e)");
      expect(src, file).toContain("auditUnknownTool()");
    }
  });
});
