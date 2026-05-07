import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard proxy public assets", () => {
  it("keeps PWA assets public so mobile login does not stall on manifest/icon requests", () => {
    const source = readFileSync("apps/dashboard/src/proxy.ts", "utf8");

    expect(source).toContain('pathname === "/manifest.json"');
    expect(source).toContain('pathname === "/icon.svg"');
  });

  it("preserves the original page query when redirecting to login", () => {
    const source = readFileSync("apps/dashboard/src/proxy.ts", "utf8");

    expect(source).toContain("const nextPath = request.nextUrl.pathname + request.nextUrl.search");
    expect(source).toContain("new URLSearchParams({ next: nextPath })");
  });
});
