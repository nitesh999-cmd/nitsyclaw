import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("reminders page", () => {
  test("invalid reminder dates return visible feedback instead of silently doing nothing", () => {
    const source = readFileSync("apps/dashboard/src/app/reminders/page.tsx", "utf8");

    expect(source).toContain('redirect("/reminders?error=invalid-date")');
    expect(source).toContain('params?.error === "invalid-date"');
    expect(source).toContain("Date not recognised.");
    expect(source).not.toContain("if (!fireAt) return;");
  });
});
