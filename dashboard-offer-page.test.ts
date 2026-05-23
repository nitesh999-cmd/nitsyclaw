import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public offer page", () => {
  it("is public, shell-light, and honest about setup-heavy integrations", () => {
    const page = readFileSync("apps/dashboard/src/app/offer/page.tsx", "utf8");
    const waitlistForm = readFileSync("apps/dashboard/src/app/offer/waitlist-form.tsx", "utf8");
    const proxy = readFileSync("apps/dashboard/src/proxy.ts", "utf8");
    const shell = readFileSync("apps/dashboard/src/app/dashboard-shell.tsx", "utf8");

    expect(proxy).toContain('pathname === "/offer"');
    expect(shell).toContain('const isPublicMarketing = pathname === "/offer";');

    expect(page).toContain("A private WhatsApp PA for the life admin that keeps piling up.");
    expect(page).toContain("No fake integrations");
    expect(page).toContain("Needs setup before live action");
    expect(page).toContain("Real Gmail and Outlook mailbox actions");
    expect(page).toContain("Does not claim provider integrations are connected until real setup proves it.");
    expect(page).toContain("Run a 10-person beta before taking public money.");
    expect(page).toContain("WaitlistInterestForm");

    expect(waitlistForm).toContain("Request beta access");
    expect(waitlistForm).toContain("opens an email draft");
    expect(waitlistForm).toContain("No payment");
    expect(waitlistForm).toContain("mailto:");
    expect(waitlistForm).not.toContain("fetch(");
    expect(waitlistForm).not.toContain("/api/waitlist");

    expect(page).not.toContain("Gmail connected");
    expect(page).not.toContain("bank feeds connected");
    expect(page).not.toContain("unlimited AI");
    expect(page).not.toContain("fully autonomous");
  });
});
