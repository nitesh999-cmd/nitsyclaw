import { afterEach, describe, expect, it, vi } from "vitest";

import { formatSafeLogError, logBotError } from "./safe-log.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("formatSafeLogError", () => {
  it("redacts contact details and tokens from runtime errors", () => {
    const error = new Error("Failed for nitesh@example.com +61 430 008 008 sk_live_12345678901234567890");

    const safe = formatSafeLogError(error);

    expect(safe).toContain("[redacted:email]");
    expect(safe).toContain("[redacted:phone]");
    expect(safe).toContain("[redacted:token]");
    expect(safe).not.toContain("nitesh@example.com");
    expect(safe).not.toContain("+61 430 008 008");
    expect(safe).not.toContain("sk_live");
  });

  it("redacts context before writing to console", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    logBotError("[test] failed", new Error("bad"), {
      email: "nitesh@example.com",
      phone: "+61 430 008 008",
      label: "voice transcription",
    });

    expect(consoleError).toHaveBeenCalledWith(
      "[test] failed",
      expect.objectContaining({
        email: "[redacted]",
        phone: "[redacted]",
        label: "voice transcription",
      }),
      "Error: bad",
    );
  });
});
