import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { auditModelRoute } from "../src/db/audit-contract.js";
import { buildModelRouteAuditPayload } from "../src/local-brain/telemetry-audit.js";
import type { RoutingTelemetryEvent } from "../src/local-brain/types.js";
import { TENANT_TABLE_BOUNDARIES } from "../src/tenancy.js";

/**
 * 5431d9c removed `ownerHash` from durable `model_route` payloads. Its commit
 * message recorded that "a repo-wide search found no consumer reading ownerHash
 * out of an audit row" — but `apps/dashboard/src/app/local-brain/page.tsx` was
 * doing exactly that, with `input->>'ownerHash' = <owner>`, so the widget
 * silently matched nothing from that commit onward.
 *
 * These tests make the two halves of that mistake unrepeatable: no source file
 * may read an owner identifier out of audit JSON, and the dashboard's view of a
 * `model_route` row must stay pinned to the keys the writer actually emits.
 */

const SCAN_ROOTS = ["apps", "packages", "scripts"];
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  ".turbo",
  ".wwebjs_cache",
]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    // Source only. Tests legitimately quote the banned patterns in assertions,
    // exactly as the audit-boundary inventory scan already excludes them.
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * Comments are stripped so these assertions test code, not prose. Both the page
 * and this file document the removed predicate in words; that documentation
 * must not be what makes the scan pass or fail.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*");
    })
    .join("\n");
}

function allSources(): Array<{ file: string; src: string }> {
  const files: Array<{ file: string; src: string }> = [];
  for (const root of SCAN_ROOTS) {
    for (const file of sourceFiles(root)) {
      files.push({ file, src: stripComments(readFileSync(file, "utf8")) });
    }
  }
  return files;
}

// ---------------------------------------------------------------------------

describe("no source reads an owner identifier out of audit_log JSON", () => {
  it("finds files to scan", () => {
    expect(allSources().length).toBeGreaterThan(200);
  });

  it("no file uses a JSON operator against an audit_log payload column", () => {
    for (const { file, src } of allSources()) {
      // `auditLog.input`/`auditLog.output` followed by a Postgres JSON operator.
      expect(src, `${file} reads audit_log JSON with -> or ->>`).not.toMatch(
        /auditLog\.(input|output)\s*\}?\s*(->>?|#>>?)/,
      );
    }
  });

  it("no file mentions ownerHash inside an audit_log JSON path", () => {
    for (const { file, src } of allSources()) {
      for (const key of ["ownerHash", "owner_hash", "tenantId", "tenant_id", "fromNumber", "phoneHash"]) {
        expect(src, `${file} reads '${key}' from audit JSON`).not.toContain(`->>'${key}'`);
        expect(src, `${file} reads "${key}" from audit JSON`).not.toContain(`->>"${key}"`);
      }
    }
  });

  it("the local brain page holds no audit_log query at all", () => {
    const page = stripComments(readFileSync("apps/dashboard/src/app/local-brain/page.tsx", "utf8"));

    expect(page).not.toContain("auditLog");
    expect(page).not.toContain("ownerHash'");
    expect(page).not.toContain("model_route");
    // The owner-scoped queries it should still make.
    expect(page).toContain("eq(memories.ownerHash, ownerHash)");
    expect(page).toContain("eq(confirmations.ownerHash, ownerHash)");
  });
});

// ---------------------------------------------------------------------------

describe("model_route key sets stay pinned to the writer", () => {
  const event: RoutingTelemetryEvent = {
    at: "2026-07-30T02:00:00.000Z",
    route: "local",
    mode: "auto",
    reasonCode: "private_everyday_local_default",
    model: "qwen3:8b",
    latencyMs: 42,
    success: true,
    fallback: false,
    requestClass: "read_only_investigation",
    sensitivity: "private",
  };

  it("input is exactly mode, reason, requestClass, sensitivity", () => {
    const entry = auditModelRoute(buildModelRouteAuditPayload(event));
    expect(Object.keys(entry.input).sort()).toEqual(["mode", "reason", "requestClass", "sensitivity"]);
  });

  it("output is exactly route, model, fallback", () => {
    const entry = auditModelRoute(buildModelRouteAuditPayload(event));
    expect(Object.keys(entry.output).sort()).toEqual(["fallback", "model", "route"]);
  });

  it("carries no owner, tenant, account or session identifier in any column", () => {
    const entry = auditModelRoute(
      buildModelRouteAuditPayload({
        ...event,
        ownerHash: "9f2c1b7a4e8d6f3021c5ab97de4410f8b2c6d9e7a1f30b8c2d4e6f8a0b1c3d5e",
        tenantId: "tenant-abc",
        sessionId: "sess_abc123456789",
      } as RoutingTelemetryEvent),
    );
    const serialized = JSON.stringify(entry);

    for (const key of ["ownerHash", "owner_hash", "tenantId", "tenant_id", "sessionId", "phone", "fromNumber"]) {
      expect(serialized, `model_route leaked ${key}`).not.toContain(key);
    }
    expect(serialized).not.toContain("9f2c1b7a");
    expect(serialized).not.toContain("tenant-abc");
    expect(entry.actor).toBe("model-router");
    expect(entry.tool).toBe("model_route");
  });

  it("reason lives in input, not output — the shape the stale widget assumed", () => {
    const entry = auditModelRoute(buildModelRouteAuditPayload(event));

    expect(entry.input.reason).toBe("private_everyday_local_default");
    expect(entry.output).not.toHaveProperty("reasonCode");
    expect(entry.output).not.toHaveProperty("reason");
  });
});

// ---------------------------------------------------------------------------

describe("audit_log cannot be owner-scoped, so the page must fail closed", () => {
  it("audit_log is still classified global with no scope column", () => {
    const boundary = TENANT_TABLE_BOUNDARIES.find((entry) => entry.table === "audit_log");

    expect(boundary).toBeDefined();
    expect(boundary!.kind).toBe("global_operational");
    expect(boundary!.scopeColumn).toBeNull();
  });

  it("two owners' routing decisions are indistinguishable in a durable row", () => {
    const base: RoutingTelemetryEvent = {
      at: "2026-07-30T02:00:00.000Z",
      route: "local",
      mode: "auto",
      reasonCode: "private_everyday_local_default",
      model: "qwen3:8b",
      latencyMs: 42,
      success: true,
      fallback: false,
      requestClass: "read_only_investigation",
      sensitivity: "private",
    };

    const ownerA = auditModelRoute(
      buildModelRouteAuditPayload({ ...base, ownerHash: "owner-a" } as RoutingTelemetryEvent),
    );
    const ownerB = auditModelRoute(
      buildModelRouteAuditPayload({ ...base, ownerHash: "owner-b" } as RoutingTelemetryEvent),
    );

    // Identical rows: nothing in a persisted model_route row can tell the two
    // owners apart, which is precisely why the widget must not claim one.
    expect(JSON.stringify(ownerA)).toBe(JSON.stringify(ownerB));
    expect(JSON.stringify(ownerA)).not.toContain("owner-a");
    expect(JSON.stringify(ownerB)).not.toContain("owner-b");
  });
});
