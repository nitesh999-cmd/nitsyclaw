import { describe, expect, test } from "vitest";
import {
  redactAuditExportRows,
  redactConnectedAccountExportRows,
} from "./apps/dashboard/src/lib/data-export-redaction";

describe("data export redaction", () => {
  test("redacts historical audit inputs, outputs, and errors before export", () => {
    const rows = redactAuditExportRows([
      {
        id: "audit-1",
        tool: "send_email",
        input: {
          to: "person@example.com",
          body: "Private body",
          nested: { phone: "+61 430 008 008", token: "sk-test123456789012345" },
        },
        output: {
          message: "Reply sent to person@example.com",
          content: "Private response",
          safeCount: 2,
        },
        error: "Failed for person@example.com with +61 430 008 008",
      },
    ]);

    const exported = JSON.stringify(rows);
    expect(exported).not.toContain("person@example.com");
    expect(exported).not.toContain("+61 430 008 008");
    expect(exported).not.toContain("Private body");
    expect(exported).not.toContain("Private response");
    expect(exported).not.toContain("sk-test");
    expect(exported).toContain("[redacted");
    expect(rows[0].output?.safeCount).toBe(2);
  });

  test("redacts connected account tokens and sensitive metadata before export", () => {
    const rows = redactConnectedAccountExportRows([
      {
        provider: "spotify",
        accessToken: "access-secret",
        refreshToken: "refresh-secret",
        metadata: {
          displayName: "Nitesh",
          email: "person@example.com",
          profileUrl: "https://open.spotify.com/user/123",
        },
      },
    ]);

    const exported = JSON.stringify(rows);
    expect(exported).not.toContain("access-secret");
    expect(exported).not.toContain("refresh-secret");
    expect(exported).not.toContain("person@example.com");
    expect(rows[0].accessToken).toBe("[redacted]");
    expect(rows[0].refreshToken).toBe("[redacted]");
  });
});
