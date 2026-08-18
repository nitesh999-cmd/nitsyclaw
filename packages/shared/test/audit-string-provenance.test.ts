import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DELETE_COUNT_TABLES,
  DELETE_SCOPES,
  OPERATOR_COMPLETE_STATUSES,
  OPERATOR_DECISIONS,
  OPERATOR_NEXT_STATUSES,
  RECOVERY_ACTIONS,
  ROUTING_ERROR_CODES,
  ROUTING_MODES,
  ROUTING_REASON_CODES,
  ROUTING_REQUEST_CLASSES,
  ROUTING_ROUTES,
  ROUTING_SENSITIVITIES,
  WEB_RESEARCH_FAILURE_CODES,
  WEB_RESEARCH_STATUSES,
  WEB_RESEARCH_TIMEOUT_CODES,
  auditDataDelete,
  auditLoopBreaker,
  auditModelRoute,
  auditOperatorComplete,
  auditOperatorDecision,
  auditOperatorVerify,
  auditRecoveryAction,
  auditToolSuccess,
  auditWebPresearch,
  auditWebResearchFallback,
} from "../src/db/audit-contract.js";
import { buildModelRouteAuditPayload } from "../src/local-brain/telemetry-audit.js";
import type { RoutingTelemetryEvent } from "../src/local-brain/types.js";

/**
 * Every category the brief requires a request-supplied string to be tested
 * against: a URL, a query, an email, a phone number, a LID, a request id, a
 * credential, a postal address, SQL, prose, and nested encoded content.
 */
const HOSTILE_IDENTIFIERS: Array<[label: string, value: string]> = [
  ["url", "https://evil.example.com/exfil?snapshot=1#frag"],
  ["query", "who did i email about the divorce settlement"],
  ["email", "nitesh@example.com"],
  ["phone", "+61430008008"],
  ["lid", "12345678901234@lid"],
  ["request id", "req_01HQZX9K2M4N6P8R0T2V4W6Y8A"],
  ["credential", "sk-ant-api03-do-not-persist"],
  ["address", "12 Marine Parade, St Kilda VIC 3182"],
  ["sql", "select * from memories where owner_hash = 'abc'"],
  ["prose", "Remember that my passport expires in March."],
  ["nested encoded", "eyJzbmFwc2hvdCI6Im5pdGVzaEBleGFtcGxlLmNvbSJ9"],
  ["encoded url", "export_%68%74%74%70%73%3A%2F%2Fevil.example.com"],
  ["null byte", "export_2026\u0000nitesh@example.com"],
  ["newline injection", "export_20260508160000\nowner_hash=9f2c1b7a"],
];

/** The real format `/api/data/export` mints: `export_` + 14 timestamp digits. */
const REAL_SNAPSHOT_ID = "export_20260508160000";
/** A DB-generated `feature_requests.id`. */
const REAL_JOB_ID = "3f7a1c2e-9b04-4d61-8f2a-5c6d7e8f9a0b";

function serialized(entry: unknown): string {
  return JSON.stringify(entry);
}

// ---------------------------------------------------------------------------
// Gap 1 — request-supplied string identifiers
// ---------------------------------------------------------------------------

describe("data_delete accepts no request-supplied identifier", () => {
  it("has no exportSnapshotId parameter left to smuggle a value through", () => {
    const source = readFileSync("packages/shared/src/db/audit-contract.ts", "utf8");
    const builder = source.slice(source.indexOf("export function auditDataDelete"));
    const signature = builder.slice(0, builder.indexOf("): SafeAuditEntry"));
    expect(signature).not.toContain("exportSnapshotId");
    expect(signature).toContain("hasExportSnapshot: boolean");
  });

  it("persists none of a hostile snapshot identifier, in any category", () => {
    for (const [label, value] of HOSTILE_IDENTIFIERS) {
      // The builder no longer accepts the field, so the only way a caller could
      // still reach it is by passing it anyway — which the contract must ignore.
      const entry = auditDataDelete({
        scope: "everything",
        hasExportSnapshot: true,
        deleted: { memories: 3 },
        durationMs: 5,
        ...({ exportSnapshotId: value } as Record<string, unknown>),
      });

      expect(entry.input, label).toEqual({ scope: "everything", hasExportSnapshot: true });
      expect(serialized(entry), `${label} leaked`).not.toContain(value);
      expect(serialized(entry), `${label} leaked a fragment`).not.toContain("exportSnapshotId");
    }
  });

  it("reduces even a real, proof-bound snapshot identifier to a boolean", () => {
    const entry = auditDataDelete({
      scope: "everything",
      hasExportSnapshot: true,
      deleted: { memories: 412, messages: 9310 },
      durationMs: 640,
      ...({ exportSnapshotId: REAL_SNAPSHOT_ID } as Record<string, unknown>),
    });

    expect(entry.input).toEqual({ scope: "everything", hasExportSnapshot: true });
    expect(serialized(entry)).not.toContain(REAL_SNAPSHOT_ID);
    expect(serialized(entry)).not.toContain("20260508160000");
  });

  it("records the export gate as false when no export proof was verified", () => {
    const entry = auditDataDelete({
      scope: "memories",
      hasExportSnapshot: false,
      deleted: { memories: 3 },
      durationMs: 1,
    });

    expect(entry.input).toEqual({ scope: "memories", hasExportSnapshot: false });
  });

  it("coerces a non-boolean export flag rather than persisting it", () => {
    const entry = auditDataDelete({
      scope: "everything",
      hasExportSnapshot: REAL_SNAPSHOT_ID as unknown as boolean,
      deleted: {},
      durationMs: 1,
    });

    expect(entry.input).toEqual({ scope: "everything", hasExportSnapshot: false });
    expect(serialized(entry)).not.toContain(REAL_SNAPSHOT_ID);
  });

  it("drops a scope outside the closed set", () => {
    for (const [label, value] of HOSTILE_IDENTIFIERS) {
      const entry = auditDataDelete({
        scope: value,
        hasExportSnapshot: false,
        deleted: {},
        durationMs: 1,
      });
      expect(entry.input, label).toEqual({ scope: "unknown_scope", hasExportSnapshot: false });
      expect(serialized(entry), label).not.toContain(value);
    }
  });

  it("covers every table the erasure route actually counts", () => {
    const route = readFileSync("apps/dashboard/src/app/api/data/delete/route.ts", "utf8");
    const written = new Set<string>();
    for (const m of route.matchAll(/deleted\.([A-Za-z][A-Za-z0-9_]*)\s*=/g)) written.add(m[1]!);

    // Guard against the scan silently matching nothing.
    expect(written.size).toBeGreaterThanOrEqual(12);
    for (const table of written) {
      expect(DELETE_COUNT_TABLES as readonly string[], `route counts ${table}`).toContain(table);
    }
  });

  it("closes row-count keys as well as row-count values", () => {
    const entry = auditDataDelete({
      scope: "everything",
      hasExportSnapshot: true,
      deleted: {
        memories: 4,
        "https://evil.example.com/?x=1": 9,
        "nitesh@example.com": 2,
        "select * from memories": 1,
        // Shape-valid identifiers are still rejected: only the closed table
        // list survives, so a request id cannot ride in as a tally key.
        req_01HQZX9K2M4N6P8R0T2V4W6Y8A: 7,
        ownerHash9f2c1b7a: 1,
      },
      durationMs: 3,
    });

    expect(entry.output).toEqual({ deleted: { memories: 4 } });
    expect(serialized(entry)).not.toContain("evil.example.com");
    expect(serialized(entry)).not.toContain("nitesh@example.com");
    expect(serialized(entry)).not.toContain("req_01HQZX");
    expect(serialized(entry)).not.toContain("9f2c1b7a");
  });

  it("keeps every real table key", () => {
    const deleted = Object.fromEntries(DELETE_COUNT_TABLES.map((t, i) => [t, i]));
    const entry = auditDataDelete({
      scope: "everything",
      hasExportSnapshot: true,
      deleted,
      durationMs: 1,
    });

    expect(entry.output).toEqual({ deleted });
  });
});

// ---------------------------------------------------------------------------

describe("operator job identifier evidence standard", () => {
  it("rejects hostile job ids in every builder that accepts one", () => {
    for (const [label, value] of HOSTILE_IDENTIFIERS) {
      const decision = auditOperatorDecision({
        event: "claim",
        jobId: value,
        decision: "claim",
        nextStatus: "in_progress",
      });
      const verify = auditOperatorVerify({
        jobId: value,
        commandCount: 1,
        success: true,
        hasFailedCommand: false,
        durationMs: 2,
      });
      const complete = auditOperatorComplete({
        jobId: value,
        status: "done",
        hasCommit: true,
        hasDeployment: false,
      });

      expect(decision.input, `decision ${label}`).toEqual({});
      expect(verify.input, `verify ${label}`).toEqual({ commandCount: 1 });
      expect(complete.input, `complete ${label}`).toEqual({});
      for (const entry of [decision, verify, complete]) {
        expect(serialized(entry), label).not.toContain(value);
      }
    }
  });

  it("rejects a shape-adjacent job id that is not exactly a UUID", () => {
    const nearMisses = [
      `${REAL_JOB_ID} `,
      ` ${REAL_JOB_ID}`,
      `${REAL_JOB_ID}x`,
      `x${REAL_JOB_ID}`,
      REAL_JOB_ID.replace(/-/g, ""),
      `${REAL_JOB_ID}\nnitesh@example.com`,
      "3f7a1c2e-9b04-4d61-8f2a-5c6d7e8f9a0",
      "3f7a1c2e_9b04_4d61_8f2a_5c6d7e8f9a0b",
      "zzzzzzzz-9b04-4d61-8f2a-5c6d7e8f9a0b",
    ];
    for (const value of nearMisses) {
      const entry = auditOperatorDecision({
        event: "claim",
        jobId: value,
        decision: "claim",
        nextStatus: "in_progress",
      });
      expect(entry.input, value).toEqual({});
    }
  });

  it("retains a proven, exactly formatted operator job id for correlation", () => {
    const entry = auditOperatorDecision({
      event: "claim",
      jobId: REAL_JOB_ID,
      decision: "claim",
      nextStatus: "in_progress",
      commandCount: 4,
    });

    expect(entry.input).toEqual({ jobId: REAL_JOB_ID });
    expect(entry.tool).toBe("operator_runner.claim");
  });

  it("keeps the same job id across claim, verify and complete so rows correlate", () => {
    const ids = [
      auditOperatorDecision({
        event: "claim",
        jobId: REAL_JOB_ID.toUpperCase(),
        decision: "claim",
        nextStatus: "in_progress",
      }).input.jobId,
      auditOperatorVerify({
        jobId: REAL_JOB_ID,
        commandCount: 2,
        success: true,
        hasFailedCommand: false,
        durationMs: 1,
      }).input.jobId,
      auditOperatorComplete({
        jobId: REAL_JOB_ID,
        status: "done",
        hasCommit: false,
        hasDeployment: false,
      }).input.jobId,
    ];

    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBe(REAL_JOB_ID);
  });

  it("never lets a caller value shape the tool column", () => {
    const entry = auditOperatorDecision({
      event: "reject; drop table audit_log" as unknown as "reject",
      jobId: REAL_JOB_ID,
      decision: "reject",
      nextStatus: "rejected",
    });

    expect(entry.tool).toBe("operator_runner.unknown");
    expect(serialized(entry)).not.toContain("drop table");
  });
});

// ---------------------------------------------------------------------------
// Closed enums: accept every real value, reject an unknown one
// ---------------------------------------------------------------------------

describe("closed enums accept all real values and reject unknowns", () => {
  const UNKNOWN = "https://evil.example.com/?q=nitesh@example.com";

  it("routing vocabularies cover every value the router can emit", () => {
    // The reason argument of `decision(...)` always follows `sensitivity,`;
    // two reasons are supplied through a ternary instead. `RequestComplexity`
    // members share the ternary shape and are excluded by name.
    const source = readFileSync("packages/shared/src/local-brain/router.ts", "utf8");
    const complexity = new Set(["simple", "moderate", "difficult"]);
    const emitted = new Set<string>();
    for (const m of source.matchAll(/sensitivity,\s*"([a-z_]+)"/g)) emitted.add(m[1]!);
    for (const m of source.matchAll(/reason:\s*"([a-z_]+)"/g)) emitted.add(m[1]!);
    for (const m of source.matchAll(/\?\s*"([a-z_]{6,})"\s*:\s*"([a-z_]{6,})"/g)) {
      emitted.add(m[1]!);
      emitted.add(m[2]!);
    }
    for (const value of complexity) emitted.delete(value);

    // Guard against the scan silently matching nothing.
    expect(emitted.size).toBeGreaterThanOrEqual(14);
    for (const reason of emitted) {
      expect(ROUTING_REASON_CODES as readonly string[], `router emits ${reason}`).toContain(reason);
    }
  });

  it("keeps every real routing enum value verbatim", () => {
    for (const mode of ROUTING_MODES) {
      for (const route of ROUTING_ROUTES) {
        for (const requestClass of ROUTING_REQUEST_CLASSES) {
          for (const sensitivity of ROUTING_SENSITIVITIES) {
            const entry = auditModelRoute(
              buildModelRouteAuditPayload({
                at: "2026-07-29T13:19:40.000Z",
                route,
                mode,
                reasonCode: "private_everyday_local_default",
                model: "qwen3:8b",
                latencyMs: 10,
                success: true,
                fallback: false,
                requestClass,
                sensitivity,
              }),
            );
            expect(entry.input.mode).toBe(mode);
            expect(entry.input.requestClass).toBe(requestClass);
            expect(entry.input.sensitivity).toBe(sensitivity);
            expect(entry.output.route).toBe(route);
          }
        }
      }
    }
    for (const reason of ROUTING_REASON_CODES) {
      const entry = auditModelRoute(
        buildModelRouteAuditPayload({
          at: "2026-07-29T13:19:40.000Z",
          route: "local",
          mode: "auto",
          reasonCode: reason,
          latencyMs: 1,
          success: true,
          fallback: false,
          requestClass: "answer_only",
          sensitivity: "private",
        }),
      );
      expect(entry.input.reason).toBe(reason);
    }
    for (const code of ROUTING_ERROR_CODES) {
      const entry = auditModelRoute(
        buildModelRouteAuditPayload({
          at: "2026-07-29T13:19:40.000Z",
          route: "cloud",
          mode: "auto",
          reasonCode: "best_reasoning_mode",
          latencyMs: 1,
          success: false,
          fallback: true,
          requestClass: "answer_only",
          sensitivity: "private",
          errorCode: code,
        }),
      );
      expect(entry.error).toBe(code);
    }
  });

  it("replaces an unknown routing value with an unknown marker, not the payload", () => {
    const event = {
      at: "2026-07-29T13:19:40.000Z",
      route: UNKNOWN,
      mode: UNKNOWN,
      reasonCode: UNKNOWN,
      model: UNKNOWN,
      latencyMs: 1,
      success: true,
      fallback: "yes",
      requestClass: UNKNOWN,
      sensitivity: UNKNOWN,
      errorCode: UNKNOWN,
    } as unknown as RoutingTelemetryEvent;

    const entry = auditModelRoute(buildModelRouteAuditPayload(event));

    expect(entry.input).toEqual({
      mode: "unknown_mode",
      reason: "unknown_reason_code",
      requestClass: "unknown_request_class",
      sensitivity: "unknown_sensitivity",
    });
    expect(entry.output).toEqual({ route: "unknown_route", model: undefined, fallback: false });
    expect(entry).not.toHaveProperty("error");
    expect(serialized(entry)).not.toContain("evil.example.com");
  });

  it("normalizes the service-reported model name and drops anything else", () => {
    for (const name of ["qwen3:8b", "llama3.1:8b-instruct-q4_K_M", "gpt-oss:20b"]) {
      const entry = auditModelRoute(
        buildModelRouteAuditPayload({
          at: "2026-07-29T13:19:40.000Z",
          route: "local",
          mode: "auto",
          reasonCode: "private_everyday_local_default",
          model: name,
          latencyMs: 1,
          success: true,
          fallback: false,
          requestClass: "answer_only",
          sensitivity: "private",
        }),
      );
      expect(entry.output.model, name).toBe(name);
    }
    for (const [label, value] of HOSTILE_IDENTIFIERS) {
      const entry = auditModelRoute(
        buildModelRouteAuditPayload({
          at: "2026-07-29T13:19:40.000Z",
          route: "local",
          mode: "auto",
          reasonCode: "private_everyday_local_default",
          model: value,
          latencyMs: 1,
          success: true,
          fallback: false,
          requestClass: "answer_only",
          sensitivity: "private",
        }),
      );
      expect(entry.output.model, label).toBeUndefined();
      expect(serialized(entry), label).not.toContain(value);
    }
  });

  it("keeps every real web research status, failure code and timeout code", () => {
    for (const status of WEB_RESEARCH_STATUSES) {
      const entry = auditWebPresearch({
        surface: "whatsapp",
        status,
        available: true,
        searchesUsed: 1,
        sourceCount: 1,
        answerLen: 10,
        failureCode: null,
        elapsedMs: 5,
        remainingBudget: 1,
      });
      expect(entry.output.status).toBe(status);
      expect(entry.output.failureCode).toBeNull();
    }
    for (const code of WEB_RESEARCH_FAILURE_CODES) {
      const entry = auditWebPresearch({
        surface: "whatsapp",
        status: "unavailable",
        available: false,
        searchesUsed: 0,
        sourceCount: 0,
        answerLen: 0,
        failureCode: code,
        elapsedMs: 5,
        remainingBudget: 0,
      });
      expect(entry.output.failureCode).toBe(code);
    }
    for (const code of WEB_RESEARCH_TIMEOUT_CODES) {
      const entry = auditWebResearchFallback({
        sourceCount: 1,
        answerLen: 1,
        searchesUsed: 1,
        elapsedMs: 1,
        timeoutCode: code,
      });
      expect(entry.output.timeoutCode).toBe(code);
    }
  });

  it("rejects unknown web research values", () => {
    const presearch = auditWebPresearch({
      surface: UNKNOWN as unknown as "whatsapp",
      status: UNKNOWN,
      available: "yes" as unknown as boolean,
      searchesUsed: 0,
      sourceCount: 0,
      answerLen: 0,
      failureCode: UNKNOWN,
      elapsedMs: 1,
      remainingBudget: 0,
    });
    expect(presearch.input).toEqual({ surface: "unknown_surface" });
    expect(presearch.output.status).toBe("unknown_status");
    expect(presearch.output.failureCode).toBe("unknown_failure_code");
    expect(presearch.success).toBe(false);
    expect(serialized(presearch)).not.toContain("evil.example.com");

    const fallback = auditWebResearchFallback({
      sourceCount: 0,
      answerLen: 0,
      searchesUsed: 0,
      elapsedMs: 1,
      timeoutCode: UNKNOWN,
    });
    expect(fallback.output.timeoutCode).toBe("unknown_timeout_code");
    expect(fallback.output.fallbackType).toBe("verified_presearch_answer");
    expect(serialized(fallback)).not.toContain("evil.example.com");
  });

  it("keeps every real recovery action and rejects anything else", () => {
    for (const action of RECOVERY_ACTIONS) {
      expect(auditRecoveryAction({ action, durationMs: 1 }).input).toEqual({ action });
    }
    for (const [label, value] of HOSTILE_IDENTIFIERS) {
      const entry = auditRecoveryAction({ action: value, durationMs: 1 });
      expect(entry.input, label).toEqual({ action: "unknown_action" });
      expect(serialized(entry), label).not.toContain(value);
    }
  });

  it("keeps every real delete scope and operator enum, and rejects unknowns", () => {
    for (const scope of DELETE_SCOPES) {
      expect(
        auditDataDelete({ scope, hasExportSnapshot: false, deleted: {}, durationMs: 1 }).input.scope,
      ).toBe(scope);
    }
    for (const decision of OPERATOR_DECISIONS) {
      for (const nextStatus of OPERATOR_NEXT_STATUSES) {
        const entry = auditOperatorDecision({
          event: decision,
          jobId: REAL_JOB_ID,
          decision,
          nextStatus,
        });
        expect(entry.output.decision).toBe(decision);
        expect(entry.output.nextStatus).toBe(nextStatus);
        expect(entry.tool).toBe(`operator_runner.${decision}`);
      }
    }
    for (const status of OPERATOR_COMPLETE_STATUSES) {
      const entry = auditOperatorComplete({
        jobId: REAL_JOB_ID,
        status,
        hasCommit: false,
        hasDeployment: false,
      });
      expect(entry.output.status).toBe(status);
    }

    const unknown = auditOperatorDecision({
      event: "claim",
      jobId: REAL_JOB_ID,
      decision: UNKNOWN as unknown as "claim",
      nextStatus: UNKNOWN as unknown as "in_progress",
    });
    expect(unknown.output.decision).toBe("unknown_decision");
    expect(unknown.output.nextStatus).toBe("unknown_status");
    expect(serialized(unknown)).not.toContain("evil.example.com");

    const unknownComplete = auditOperatorComplete({
      jobId: REAL_JOB_ID,
      status: UNKNOWN as unknown as "done",
      hasCommit: UNKNOWN as unknown as boolean,
      hasDeployment: false,
    });
    expect(unknownComplete.output).toEqual({
      status: "unknown_status",
      hasCommit: false,
      hasDeployment: false,
    });
  });

  it("normalizes the tool column to a registry-shaped token", () => {
    expect(auditToolSuccess({ tool: "memory_search", projected: { input: {}, output: {} }, durationMs: 1 }).tool)
      .toBe("memory_search");
    for (const [label, value] of HOSTILE_IDENTIFIERS) {
      const entry = auditToolSuccess({
        tool: value,
        projected: { input: {}, output: {} },
        durationMs: 1,
      });
      expect(entry.tool, label).toBe("unknown_tool");
      expect(serialized(entry), label).not.toContain(value);
    }
  });
});

// ---------------------------------------------------------------------------
// Timestamps
// ---------------------------------------------------------------------------

describe("durable timestamps are application-generated ISO values", () => {
  it("keeps a canonical ISO instant", () => {
    const entry = auditLoopBreaker({
      reason: "inbound matched recent outbound",
      resetAt: "2026-07-29T13:25:00.000Z",
    });
    expect(entry.output).toEqual({
      action: "cooldown_whatsapp_replies",
      resetAt: "2026-07-29T13:25:00.000Z",
    });
  });

  it("re-serializes an offset instant rather than storing it as written", () => {
    const entry = auditLoopBreaker({
      reason: "inbound matched recent outbound",
      resetAt: "2026-07-29T23:25:00+10:00",
    });
    expect(entry.output.resetAt).toBe("2026-07-29T13:25:00.000Z");
  });

  it("rejects prose, malformed dates, loose forms and out-of-range instants", () => {
    const rejected = [
      "hello world",
      "not a date",
      "2026",
      "2026-13-45T99:99:99Z",
      "29/07/2026",
      "July 29, 2026",
      "1785331500000",
      "+275760-09-13T00:00:00.000Z",
      "1970-01-01T00:00:00.000Z",
      "2026-07-29T13:25:00.000Z nitesh@example.com",
      "https://evil.example.com/2026-07-29T13:25:00.000Z",
      "",
    ];
    for (const value of rejected) {
      const entry = auditLoopBreaker({ reason: "inbound matched recent outbound", resetAt: value });
      expect(entry.output, value).toEqual({ action: "paused_whatsapp_replies" });
      expect(entry.input, value).toEqual({ reasonCode: "inbound_echo_match", cooldown: false });
      if (value) expect(serialized(entry), value).not.toContain(value);
    }
  });

  it("rejects a non-string timestamp", () => {
    for (const value of [42, {}, [], null, undefined, true]) {
      const entry = auditLoopBreaker({
        reason: "inbound matched recent outbound",
        resetAt: value as unknown as string,
      });
      expect(entry.output).toEqual({ action: "paused_whatsapp_replies" });
    }
  });
});

// ---------------------------------------------------------------------------
// Runtime behaviour is unchanged
// ---------------------------------------------------------------------------

describe("no runtime behaviour changed alongside the audit shaping", () => {
  it("keeps every deletion gate in the delete route", () => {
    const route = readFileSync("apps/dashboard/src/app/api/data/delete/route.ts", "utf8");
    expect(route).toContain("requireSameOrigin(req)");
    expect(route).toContain("requireDashboardSession(req)");
    expect(route).toContain("blockPublicSaleCustomerDataAccess()");
    expect(route).toContain("constantTimeEqual(currentPassword, expectedPassword)");
    // Export-before-delete still gates the erasure, and still uses the raw
    // request value for verification — only the audit row stopped storing it.
    expect(route).toContain("verifyExportProof({");
    expect(route).toContain("snapshotId: exportSnapshotId");
    expect(route).toContain('if (!verifiedExportProof)');
    expect(route).toContain('deleteError: "export"');
    // Atomicity and ownership scoping.
    expect(route).toContain("db.transaction(async (tx) =>");
    expect(route).toContain("eq(memories.ownerHash, ownerHash)");
  });

  it("still writes the erasure receipt inside the deletion transaction", () => {
    const route = readFileSync("apps/dashboard/src/app/api/data/delete/route.ts", "utf8");
    const transaction = route.slice(
      route.indexOf("db.transaction(async (tx)"),
      route.indexOf("return deleted;"),
    );
    expect(transaction).toContain("tx.insert(auditLog)");
    expect(transaction).toContain("auditDataDelete({");
  });

  it("leaves the operator scripts correlating on the real queue row id", () => {
    const runner = readFileSync("scripts/operator-runner.ts", "utf8");
    const complete = readFileSync("scripts/operator-complete.ts", "utf8");
    expect(runner).toContain("jobId: job.id");
    expect(complete).toContain("jobId: id");
    // The CLI still refuses a non-UUID before touching the database.
    expect(complete).toContain("id must be a feature request UUID");
    expect(complete).toContain('expectedStatus: "in_progress"');
  });
});
