import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard integrations page", () => {
  test("shows blocked and partial statuses for permission-heavy requested rails", () => {
    const source = readFileSync("apps/dashboard/src/app/integrations/page.tsx", "utf8");

    expect(source).toContain('name: "Gmail"');
    expect(source).toContain("confirmation-gated draft requests are available");
    expect(source).toContain("Selected file/link requests can be queued now");
    expect(source).toContain("CSV import requests can be queued now");
    expect(source).toContain("SMS copy and call-prep requests work now");
    expect(source).toContain("Use the WhatsApp phrase on each row to queue setup safely");
    expect(source).toContain("A queued request is not the same as a connected account");
    expect(source).toContain("Best order: email PA first");
    expect(source).toContain("setupChecklist");
    expect(source).toContain("selected-file permissions first");
    expect(source).toContain("Require exact contact confirmation before send/call");
    expect(source).toContain("consent, retry, dedupe, and revoke flow");
    expect(source).toContain("WhatsApp:");
    expect(source).toContain("connect Gmail so you can draft replies");
    expect(source).toContain("browse my Google Drive files");
    expect(source).toContain("connect bank feeds for expenses");
    expect(source).toContain('status: "Blocked"');
    expect(source).toContain('name: "Facebook birthdays"');
    expect(source).toContain('name: "Social video analysis"');
    expect(source).toContain('status: "Partial"');
    expect(source).not.toContain('name: "Bank feeds",\n      status: "Connected"');
    expect(source).not.toContain('name: "Facebook birthdays",\n      status: "Connected"');
  });
});
