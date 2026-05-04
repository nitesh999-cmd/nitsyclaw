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
});
