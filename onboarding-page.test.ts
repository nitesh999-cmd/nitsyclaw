import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard onboarding page", () => {
  test("is written for normal users and separates ready, setup, safety, and first tasks", () => {
    const source = readFileSync("apps/dashboard/src/app/onboarding/page.tsx", "utf8");

    expect(source).toContain("Your personal PA, in plain words");
    expect(source).toContain("No AI knowledge needed");
    expect(source).toContain("First useful tasks");
    expect(source).toContain("Works now");
    expect(source).toContain("Needs setup");
    expect(source).toContain("Safety");
    expect(source).toContain("Try first task");
    expect(source).toContain("If something could affect the outside world, it asks first");
    expect(source).not.toContain("control plane");
  });
});
