import { describe, expect, it } from "vitest";

import { formatSafeLogError } from "./safe-log.js";

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
});
