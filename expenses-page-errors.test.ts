import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("expenses page add-expense errors", () => {
  it("redirects invalid submitted expense values to user-readable error states", () => {
    const source = readFileSync("apps/dashboard/src/app/expenses/page.tsx", "utf8");

    expect(source).toContain('redirect("/expenses?error=invalid-amount")');
    expect(source).toContain('redirect("/expenses?error=invalid-currency")');
    expect(source).toContain('redirect("/expenses?error=invalid-date")');
    expect(source).toContain("Amount must be a positive number");
    expect(source).toContain("Currency must be a 3-letter code");
    expect(source).toContain("Date not recognised");
    expect(source).toContain('role="alert"');
  });
});
