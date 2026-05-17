import { describe, expect, it } from "vitest";

import { formatOperatorCompleteError } from "./operator-complete.js";

describe("operator complete safety", () => {
  it("redacts secret and contact-shaped data from failures", () => {
    const message = formatOperatorCompleteError(
      new Error("failed postgres://user:pass@example.test/db nitesh@example.com +61 430 008 008 sk_live_secret123456"),
    );

    expect(message).toContain("[redacted:database-url]");
    expect(message).toContain("[redacted:email]");
    expect(message).toContain("[redacted:phone]");
    expect(message).toContain("[redacted:token]");
    expect(message).not.toContain("postgres://");
    expect(message).not.toContain("nitesh@example.com");
    expect(message).not.toContain("+61 430 008 008");
    expect(message).not.toContain("sk_live");
  });
});
