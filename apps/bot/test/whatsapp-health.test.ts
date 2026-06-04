import { describe, expect, it } from "vitest";
import {
  isHealthyWhatsAppState,
  isReadyWhatsAppRuntimeEvent,
  isUnhealthyWhatsAppState,
  publicWhatsAppRuntimeMetadata,
  shouldRestartWhatsAppClient,
  statusForWhatsAppRuntimeEvent,
} from "../src/whatsapp-health.js";

describe("WhatsApp health helpers", () => {
  it("treats CONNECTED as healthy", () => {
    expect(isHealthyWhatsAppState("CONNECTED")).toBe(true);
    expect(isUnhealthyWhatsAppState("CONNECTED")).toBe(false);
  });

  it("treats missing or disconnected states as unhealthy", () => {
    expect(isHealthyWhatsAppState(null)).toBe(false);
    expect(isUnhealthyWhatsAppState(null)).toBe(true);
    expect(isUnhealthyWhatsAppState("UNPAIRED_IDLE")).toBe(true);
    expect(isUnhealthyWhatsAppState("conflict")).toBe(true);
  });

  it("requires repeated probe failures before restart", () => {
    expect(shouldRestartWhatsAppClient(1, 2)).toBe(false);
    expect(shouldRestartWhatsAppClient(2, 2)).toBe(true);
    expect(shouldRestartWhatsAppClient(3, 2)).toBe(true);
  });

  it("maps runtime events to dashboard heartbeat statuses", () => {
    expect(statusForWhatsAppRuntimeEvent({ status: "ready" })).toBe("ok");
    expect(statusForWhatsAppRuntimeEvent({ status: "health_ok" })).toBe("ok");
    expect(statusForWhatsAppRuntimeEvent({ status: "initializing" })).toBe("restarting");
    expect(statusForWhatsAppRuntimeEvent({ status: "restarting" })).toBe("restarting");
    expect(statusForWhatsAppRuntimeEvent({ status: "qr_required" })).toBe("needs_attention");
    expect(statusForWhatsAppRuntimeEvent({ status: "auth_failure" })).toBe("needs_attention");
    expect(statusForWhatsAppRuntimeEvent({ status: "disconnected" })).toBe("needs_attention");
    expect(statusForWhatsAppRuntimeEvent({ status: "stopped" })).toBe("stopped");
  });

  it("does not report QR-required or disconnected states as runtime-ready", () => {
    expect(isReadyWhatsAppRuntimeEvent({ status: "ready" })).toBe(true);
    expect(isReadyWhatsAppRuntimeEvent({ status: "health_ok", state: "CONNECTED" })).toBe(true);
    expect(isReadyWhatsAppRuntimeEvent({ status: "qr_required", qrAvailable: true })).toBe(false);
    expect(isReadyWhatsAppRuntimeEvent({ status: "disconnected" })).toBe(false);
    expect(isReadyWhatsAppRuntimeEvent({ status: "auth_failure" })).toBe(false);
  });

  it("stores safe runtime metadata without QR payloads", () => {
    const metadata = publicWhatsAppRuntimeMetadata({
      status: "qr_required",
      qrAvailable: true,
      reason: "x".repeat(250),
      at: "2026-05-04T10:00:00.000Z",
    });

    expect(metadata).toEqual({
      status: "qr_required",
      reason: "x".repeat(180),
      state: undefined,
      consecutiveFailures: undefined,
      qrAvailable: true,
      at: "2026-05-04T10:00:00.000Z",
    });
    expect(JSON.stringify(metadata)).not.toContain("data=");
  });
});
