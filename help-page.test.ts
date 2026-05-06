import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard help page", () => {
  test("shows safe integration examples instead of broad-access claims", () => {
    const source = readFileSync("apps/dashboard/src/app/help/page.tsx", "utf8");

    expect(source).toContain("Draft an email to Alex");
    expect(source).toContain("Files and photos");
    expect(source).toContain("Prepare an SMS draft");
    expect(source).toContain("Queue a bank CSV import");
    expect(source).toContain("queues selected-file/import/draft requests");
    expect(source).toContain("Website map");
    expect(source).toContain("Command is the planning desk");
    expect(source).toContain("Queue is the build/request backlog");
    expect(source).toContain("Health shows WhatsApp and system status");
    expect(source).not.toContain("scan all my Drive");
  });
});
