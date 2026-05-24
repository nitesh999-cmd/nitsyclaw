import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard help page", () => {
  test("shows safe integration examples instead of broad-access claims", () => {
    const source = readFileSync("apps/dashboard/src/app/help/page.tsx", "utf8");

    expect(source).toContain("WhatsApp life-admin commands");
    expect(source).toContain("weekly admin digest");
    expect(source).toContain("bill summary: AGL bill $240 due 18 May");
    expect(source).toContain("find expense chemist");
    expect(source).toContain("Gmail, Outlook, Drive, Photos, Spotify, SMS sending, calls, and bank feeds need setup first.");
    expect(source).toContain("drafts or queues requests");
    expect(source).toContain("Website map");
    expect(source).toContain("Start with Today for daily use");
    expect(source).not.toContain("Command is the planning desk");
    expect(source).not.toContain("Queue is the build/request backlog");
    expect(source).not.toContain("Health shows WhatsApp and system status");
    expect(source).not.toContain("Search Gmail");
    expect(source).not.toContain("Search Spotify");
    expect(source).not.toContain("scan all my Drive");
  });
});
