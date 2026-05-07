import { describe, expect, it } from "vitest";

import { sanitizeAuditPayload } from "../src/db/repo.js";

describe("audit payload sanitizer", () => {
  it("caps wide objects before they are written to audit logs", () => {
    const widePayload = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [`field${index}`, `value ${index}`]),
    );

    const sanitized = sanitizeAuditPayload({
      request: {
        ...widePayload,
        email: "nitesh@example.com",
      },
    });

    expect(sanitized.request).toMatchObject({
      count: 41,
      sample: expect.objectContaining({
        field0: "value 0",
      }),
    });
    expect(JSON.stringify(sanitized)).not.toContain("field39");
    expect(JSON.stringify(sanitized)).not.toContain("nitesh@example.com");
  });
});
