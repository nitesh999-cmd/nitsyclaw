import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("controlled demo page", () => {
  test("keeps the validation demo focused, safe, and honest", () => {
    const source = readFileSync("apps/dashboard/src/app/demo/page.tsx", "utf8");

    expect(source).toContain("Controlled validation");
    expect(source).toContain("WhatsApp life-admin command centre");
    expect(source).toContain("proof test");
    expect(source).toContain("bill summary: AGL bill $240 due 18 May ref 12345");
    expect(source).toContain("I spent $18.40 at Chemist Warehouse for medicine");
    expect(source).toContain("Remind me to pay AGL on 17 May at 9 am");
    expect(source).toContain("weekly admin digest");
    expect(source).toContain("what went wrong");
    expect(source).toContain("Expenses default to AUD");
    expect(source).toContain("Risky actions are drafted or held for confirmation");
    expect(source).toContain("Unavailable integrations are clearly marked as not live");
    expect(source).toContain("The bot does not send a separate progress acknowledgement");
    expect(source).toContain("Public sale, self-serve tenant signup, or multi-customer rollout");
    expect(source).not.toContain("Gmail is connected");
    expect(source).not.toContain("Send real SMS");
    expect(source).not.toContain("Saved. Working on it.");
  });
});
