import { describe, expect, it, vi } from "vitest";
import { markPresenceUnavailable } from "./whatsapp-presence.js";

describe("markPresenceUnavailable", () => {
  it("marks the WhatsApp client unavailable", async () => {
    const sendPresenceUnavailable = vi.fn(async () => {});

    await expect(
      markPresenceUnavailable({ sendPresenceUnavailable }, 100, "test"),
    ).resolves.toBe(true);

    expect(sendPresenceUnavailable).toHaveBeenCalledTimes(1);
  });

  it("returns false instead of throwing when unavailable presence fails", async () => {
    const sendPresenceUnavailable = vi.fn(async () => {
      throw new Error("presence failed");
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      markPresenceUnavailable({ sendPresenceUnavailable }, 100, "test"),
    ).resolves.toBe(false);
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
