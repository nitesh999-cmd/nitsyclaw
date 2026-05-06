import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PRESENCE_UNAVAILABLE_INTERVAL_MS,
  markPresenceUnavailable,
  parsePresenceUnavailableIntervalMs,
} from "./whatsapp-presence.js";

describe("WhatsApp presence", () => {
  it("uses a safe default interval when unset or invalid", () => {
    expect(parsePresenceUnavailableIntervalMs(undefined)).toBe(DEFAULT_PRESENCE_UNAVAILABLE_INTERVAL_MS);
    expect(parsePresenceUnavailableIntervalMs("")).toBe(DEFAULT_PRESENCE_UNAVAILABLE_INTERVAL_MS);
    expect(parsePresenceUnavailableIntervalMs("-1")).toBe(DEFAULT_PRESENCE_UNAVAILABLE_INTERVAL_MS);
    expect(parsePresenceUnavailableIntervalMs("not-a-number")).toBe(DEFAULT_PRESENCE_UNAVAILABLE_INTERVAL_MS);
    expect(parsePresenceUnavailableIntervalMs("3600001")).toBe(DEFAULT_PRESENCE_UNAVAILABLE_INTERVAL_MS);
  });

  it("allows disabling or tuning the periodic unavailable heartbeat", () => {
    expect(parsePresenceUnavailableIntervalMs("0")).toBe(0);
    expect(parsePresenceUnavailableIntervalMs("15000")).toBe(15_000);
    expect(parsePresenceUnavailableIntervalMs("15000.8")).toBe(15_000);
  });

  it("returns false when presence unavailable fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      markPresenceUnavailable(
        { sendPresenceUnavailable: async () => { throw new Error("offline"); } },
        100,
        "test presence",
      ),
    ).resolves.toBe(false);
    spy.mockRestore();
  });
});
