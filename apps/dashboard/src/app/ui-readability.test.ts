import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard readability", () => {
  it("keeps legacy dark slate utilities readable on the warm home UI", () => {
    const css = readFileSync("apps/dashboard/src/app/globals.css", "utf8");

    expect(css).toContain("Warm readability compatibility overrides");
    expect(css).toContain(".nc-glass-panel");
    expect(css).toContain(".nc-mobile-nav");
    expect(css).toContain(".nc-mobile-action-grid");
    expect(css).toContain(".nc-mobile-action-primary");
    expect(css).toContain("outline: 3px solid");
    expect(css).toContain(".text-slate-100");
    expect(css).toContain(".text-slate-400");
    expect(css).toContain(".bg-slate-900\\/40");
    expect(css).toContain(".bg-slate-950\\/45");
    expect(css).toContain(".hover\\:bg-slate-700\\/60:hover");
    expect(css).toContain(".border-slate-800");
    expect(css).toContain(".hover\\:border-slate-700:hover");
    expect(css).toContain(".text-stone-500");
    expect(css).toContain(".text-amber-300");
    expect(css).toContain(".text-emerald-300");
    expect(css).toContain(".bg-amber-950\\/20");
  });
});
