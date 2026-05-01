import { describe, expect, it } from "vitest";
import {
  isHealthyWhatsAppState,
  isUnhealthyWhatsAppState,
  shouldRestartWhatsAppClient,
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
});
