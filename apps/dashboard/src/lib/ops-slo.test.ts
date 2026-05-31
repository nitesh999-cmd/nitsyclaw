import { describe, expect, it } from "vitest";
import { buildOpsSloDashboard, heartbeatAgeMinutes, p95 } from "./ops-slo";

describe("ops SLO dashboard", () => {
  it("marks production healthy when all service indicators meet targets", () => {
    const dashboard = buildOpsSloDashboard({
      dashboardOk: true,
      botFreshness: "ok",
      botFreshMinutes: 2,
      queueOldestHours: 3,
      apiP95LatencyMs: 800,
      failedToolRate: 0.01,
      liveSmokeFreshness: "ok",
    });

    expect(dashboard.status).toBe("healthy");
    expect(dashboard.score).toBe(100);
    expect(dashboard.indicators.every((indicator) => indicator.passed)).toBe(true);
  });

  it("flags old queues, slow APIs, failed tools, and missing smoke proof", () => {
    const dashboard = buildOpsSloDashboard({
      dashboardOk: true,
      botFreshness: "ok",
      botFreshMinutes: 1,
      queueOldestHours: 50,
      apiP95LatencyMs: 4_000,
      failedToolRate: 0.2,
      liveSmokeFreshness: "missing",
    });

    expect(dashboard.status).toBe("action");
    expect(dashboard.indicators.find((indicator) => indicator.key === "queue-age")).toMatchObject({
      passed: false,
      tone: "watch",
    });
    expect(dashboard.indicators.find((indicator) => indicator.key === "failed-tool-rate")).toMatchObject({
      passed: false,
      tone: "bad",
    });
    expect(dashboard.indicators.find((indicator) => indicator.key === "live-smoke")).toMatchObject({
      passed: false,
      value: "missing",
    });
  });

  it("calculates p95 without accepting negative or invalid durations", () => {
    expect(p95([100, 200, 300, Number.NaN, -1, 400])).toBe(400);
    expect(p95([])).toBeNull();
  });

  it("calculates heartbeat age in minutes", () => {
    expect(heartbeatAgeMinutes(
      { lastSeenAt: new Date("2026-05-31T03:55:00.000Z") },
      new Date("2026-05-31T04:00:00.000Z"),
    )).toBe(5);
  });
});
