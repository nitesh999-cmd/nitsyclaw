import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard readability", () => {
  it("keeps legacy dark slate utilities readable on the warm home UI", () => {
    const css = readFileSync("apps/dashboard/src/app/globals.css", "utf8");

    expect(css).toContain("Warm readability compatibility overrides");
    expect(css).toContain(".text-slate-100");
    expect(css).toContain(".text-slate-400");
    expect(css).toContain(".bg-slate-900\\/40");
    expect(css).toContain(".border-slate-800");
  });
});
