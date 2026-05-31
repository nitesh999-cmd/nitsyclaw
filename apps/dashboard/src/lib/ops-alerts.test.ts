import { describe, expect, it } from "vitest";
import { buildOpsAlerts } from "./ops-alerts";

describe("ops alerts", () => {
  it("raises P1 alerts for stale WhatsApp, failed queue jobs, failed smoke, and missing owner config", () => {
    const alerts = buildOpsAlerts({
      botFreshness: "stale",
      whatsappFreshness: "missing",
      whatsappSendFreshness: "ok",
      whatsappSendStatus: "ok",
      loopGuardStatus: "ok",
      failedCommandJobs: 2,
      retryingCommandJobs: 1,
      failedToolRate: 0.2,
      recentFailures24h: 12,
      activeAuthLockouts: 0,
      liveSmokeFreshness: "missing",
      liveSmokeStatus: null,
      missingEnvLabels: ["WhatsApp owner"],
    });

    expect(alerts.map((alert) => alert.key)).toEqual([
      "stale-whatsapp-bot",
      "failed-queue-jobs",
      "high-error-rate",
      "failed-production-smoke",
      "missing-env",
    ]);
    expect(alerts.every((alert) => alert.severity === "P1")).toBe(true);
  });

  it("keeps healthy systems quiet", () => {
    expect(buildOpsAlerts({
      botFreshness: "ok",
      whatsappFreshness: "ok",
      whatsappSendFreshness: "ok",
      whatsappSendStatus: "ok",
      loopGuardStatus: "ok",
      failedCommandJobs: 0,
      retryingCommandJobs: 0,
      failedToolRate: 0.01,
      recentFailures24h: 0,
      activeAuthLockouts: 0,
      liveSmokeFreshness: "ok",
      liveSmokeStatus: "ok",
      missingEnvLabels: [],
    })).toEqual([]);
  });

  it("uses lower severity for elevated but not critical operational signals", () => {
    const alerts = buildOpsAlerts({
      botFreshness: "ok",
      whatsappFreshness: "ok",
      whatsappSendFreshness: "ok",
      whatsappSendStatus: "ok",
      loopGuardStatus: "ok",
      failedCommandJobs: 0,
      retryingCommandJobs: 1,
      failedToolRate: 0.08,
      recentFailures24h: 4,
      activeAuthLockouts: 1,
      liveSmokeFreshness: "ok",
      liveSmokeStatus: "ok",
      missingEnvLabels: ["Spotify env"],
    });

    expect(alerts).toEqual([
      expect.objectContaining({ key: "failed-queue-jobs", severity: "P2" }),
      expect.objectContaining({ key: "elevated-error-rate", severity: "P2" }),
      expect.objectContaining({ key: "auth-lockouts", severity: "P2" }),
      expect.objectContaining({ key: "missing-env", severity: "P3" }),
    ]);
  });
});
