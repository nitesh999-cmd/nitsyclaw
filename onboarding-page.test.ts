import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard onboarding page", () => {
  test("is written for normal users and separates ready, setup, safety, and first tasks", () => {
    const source = readFileSync("apps/dashboard/src/app/onboarding/page.tsx", "utf8");

    expect(source).toContain("Set up the validation demo");
    expect(source).toContain("Answer once. Use everywhere.");
    expect(source).toContain("Save PA profile");
    expect(source).toContain("Bills, receipts, expenses, and reminders first.");
    expect(source).toContain("Bill or receipt summary");
    expect(source).toContain("Due-date reminder");
    expect(source).toContain("Log spending");
    expect(source).toContain("Drafts and memory are supporting features");
    expect(source).toContain("home_location");
    expect(source).toContain("default_currency");
    expect(source).toContain("reply_language");
    expect(source).toContain("first_three_jobs");
    expect(source).toContain("This saves profile context only");
    expect(source).toContain("It does not connect Gmail, Outlook, Calendar, Spotify, Drive, Photos, SMS, bank feeds, birthdays, social video, or any outside account.");
    expect(source).toContain("No AI knowledge needed");
    expect(source).toContain("First useful tasks");
    expect(source).toContain("Works now");
    expect(source).toContain("Needs setup");
    expect(source).toContain("Safety");
    expect(source).toContain("Sending, calling, booking, deleting, or paying still needs confirmation");
    expect(source).not.toContain("control plane");
    expect(source).not.toContain("Gmail is connected");
    expect(source).not.toContain("Music account connected");
  });
});
