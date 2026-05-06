import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("legal and privacy surfaces", () => {
  test("has plain public privacy and terms pages linked from the shell", () => {
    const privacy = readFileSync("apps/dashboard/src/app/privacy/page.tsx", "utf8");
    const terms = readFileSync("apps/dashboard/src/app/terms/page.tsx", "utf8");
    const shell = readFileSync("apps/dashboard/src/app/dashboard-shell.tsx", "utf8");
    const login = readFileSync("apps/dashboard/src/app/login/page.tsx", "utf8");
    const layout = readFileSync("apps/dashboard/src/app/layout.tsx", "utf8");

    expect(privacy).toContain("What NitsyClaw stores");
    expect(privacy).toContain("What delete does");
    expect(privacy).toContain("Provider accounts");
    expect(terms).toContain("Private beta terms");
    expect(terms).toContain("Not financial, legal, medical, or emergency advice");
    expect(privacy).not.toContain("text-white");
    expect(terms).not.toContain("text-white");
    expect(privacy).not.toContain("text-slate-200");
    expect(terms).not.toContain("text-slate-200");
    expect(shell).toContain('href="/privacy"');
    expect(shell).toContain('href="/terms"');
    expect(login).toContain('href="/privacy"');
    expect(login).toContain('href="/terms"');
    expect(shell).toContain("Personal life admin");
    expect(shell).not.toContain("Personal AI control plane");
    expect(layout).toContain("Personal life admin");
    expect(layout).not.toContain("Personal AI control plane");
    const middleware = readFileSync("apps/dashboard/src/proxy.ts", "utf8");
    expect(middleware).toContain('pathname === "/privacy"');
    expect(middleware).toContain('pathname === "/terms"');
  });
});
