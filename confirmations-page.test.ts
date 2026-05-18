import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard confirmations page", () => {
  test("uses action-specific email draft summary redaction", () => {
    const source = readFileSync("apps/dashboard/src/app/confirmations/page.tsx", "utf8");

    expect(source).toContain('copy.createdFrom === "queue_email_draft_creation"');
    expect(source).toContain('subject: "[redacted]"');
    expect(source).toContain("recipient(s)");
    expect(source).not.toContain("subject: copy.subject");
  });

  test("shows approval rail risk, expiry, undo, and dashboard safety controls", () => {
    const source = readFileSync("apps/dashboard/src/app/confirmations/page.tsx", "utf8");

    expect(source).toContain("approvalProfile");
    expect(source).toContain("Risk:");
    expect(source).toContain("Expires");
    expect(source).toContain("Undo:");
    expect(source).toContain("Approve safely");
    expect(source).toContain("Use WhatsApp approval");
    expect(source).toContain("local approval cannot undo");
    expect(source).toContain("ownerHash");
  });
});
