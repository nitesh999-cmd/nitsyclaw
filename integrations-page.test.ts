import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard integrations page", () => {
  test("shows blocked and partial statuses for permission-heavy requested rails", () => {
    const source = readFileSync("apps/dashboard/src/app/integrations/page.tsx", "utf8");

    expect(source).toContain('status: "Blocked"');
    expect(source).toContain('name: "Facebook birthdays"');
    expect(source).toContain('name: "Social video analysis"');
    expect(source).toContain('status: "Partial"');
    expect(source).not.toContain('name: "Bank feeds",\n      status: "Connected"');
    expect(source).not.toContain('name: "Facebook birthdays",\n      status: "Connected"');
  });
});
