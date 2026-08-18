import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildModelRouteAuditPayload } from "../src/local-brain/telemetry-audit.js";
import type { RoutingTelemetryEvent } from "../src/local-brain/types.js";

const APPROVED_INPUT_KEYS = ["mode", "reason", "requestClass", "sensitivity"];
const APPROVED_OUTPUT_KEYS = ["fallback", "model", "route"];

/** Realistic salted-hash shape, plus values disguised as other identifier kinds. */
const HOSTILE_OWNER_VALUES = [
  "9f2c1b7a4e8d6f3021c5ab97de4410f8b2c6d9e7a1f30b8c2d4e6f8a0b1c3d5e",
  "https://profile.example.com/owner/9f2c1b7a",
  "+61430008008",
  "nitesh@example.com",
  "req_abc123456",
  "12345@lid",
  "sk-ant-secret-value",
  "a".repeat(64),
];

function event(overrides: Partial<RoutingTelemetryEvent> = {}): RoutingTelemetryEvent {
  return {
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
    ...overrides,
  };
}

describe("model_route audit payload", () => {
  it("uses exactly the approved input key set", () => {
    expect(Object.keys(buildModelRouteAuditPayload(event()).input).sort()).toEqual(APPROVED_INPUT_KEYS);
  });

  it("uses exactly the approved output key set", () => {
    expect(Object.keys(buildModelRouteAuditPayload(event()).output).sort()).toEqual(APPROVED_OUTPUT_KEYS);
  });

  it("carries the routing values the operator needs", () => {
    const payload = buildModelRouteAuditPayload(event());

    expect(payload.input).toEqual({
      mode: "auto",
      reason: "private_everyday_local_default",
      requestClass: "read_only_investigation",
      sensitivity: "private",
    });
    expect(payload.output).toEqual({ route: "local", model: "qwen3:8b", fallback: false });
    expect(payload.success).toBe(true);
    expect(payload.durationMs).toBe(18159);
  });

  it("persists no ownerHash key or value when one is attached to the event", () => {
    const withOwner = { ...event(), ownerHash: HOSTILE_OWNER_VALUES[0] } as RoutingTelemetryEvent;

    const payload = buildModelRouteAuditPayload(withOwner);
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toContain("ownerHash");
    expect(serialized).not.toContain(HOSTILE_OWNER_VALUES[0]!);
  });

  it("keeps an owner-shaped value out of input, output and error whatever form it takes", () => {
    for (const value of HOSTILE_OWNER_VALUES) {
      const payload = buildModelRouteAuditPayload({
        ...event({ errorCode: "model_call_failed" }),
        ownerHash: value,
        tenantHash: value,
        userId: value,
        sessionId: value,
        requestId: value,
      } as RoutingTelemetryEvent);

      const serialized = JSON.stringify(payload);
      expect(serialized, value).not.toContain(value);
      for (const key of ["ownerHash", "tenantHash", "userId", "sessionId", "requestId"]) {
        expect(serialized, key).not.toContain(key);
      }
      // The bounded routing code still reaches the error column.
      expect(payload.error).toBe("model_call_failed");
    }
  });

  it("produces identical key sets for two different owner hashes, with routing values unchanged", () => {
    const [first, second] = [
      buildModelRouteAuditPayload({ ...event(), ownerHash: HOSTILE_OWNER_VALUES[0] } as RoutingTelemetryEvent),
      buildModelRouteAuditPayload({ ...event(), ownerHash: "0123456789abcdef0123456789abcdef" } as RoutingTelemetryEvent),
    ];

    expect(Object.keys(first.input).sort()).toEqual(Object.keys(second.input).sort());
    expect(Object.keys(first.output).sort()).toEqual(Object.keys(second.output).sort());
    // Routing decision itself is byte-identical — the owner value never influenced it.
    expect(first).toEqual(second);
  });

  it("omits the error field entirely when the route succeeded", () => {
    expect(buildModelRouteAuditPayload(event())).not.toHaveProperty("error");
  });

  it("records a cloud fallback without introducing extra keys", () => {
    const payload = buildModelRouteAuditPayload(
      event({ route: "cloud", model: undefined, fallback: true, reasonCode: "local_runtime_failure_safe_cloud_fallback" }),
    );

    expect(Object.keys(payload.input).sort()).toEqual(APPROVED_INPUT_KEYS);
    expect(Object.keys(payload.output).sort()).toEqual(APPROVED_OUTPUT_KEYS);
    expect(payload.output.route).toBe("cloud");
    expect(payload.output.fallback).toBe(true);
  });
});

describe("model_route producers", () => {
  const PRODUCERS = [
    "apps/bot/src/adapters.ts",
    "apps/dashboard/src/app/api/chat/route.ts",
    "apps/dashboard/src/app/api/chat/stream/route.ts",
  ];

  it("every producer builds its payload through the shared builder", () => {
    for (const file of PRODUCERS) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toContain("buildModelRouteAuditPayload(event)");
    }
  });

  it("no producer places ownerHash into a model_route audit payload", () => {
    for (const file of PRODUCERS) {
      const src = readFileSync(file, "utf8");
      const start = src.indexOf("telemetry:");
      const telemetry = src.slice(start, src.indexOf("});", src.indexOf("logAudit", start)) + 3);
      expect(telemetry, file).not.toContain("ownerHash");
    }
  });
});
