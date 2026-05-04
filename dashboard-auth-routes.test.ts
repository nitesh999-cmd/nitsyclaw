import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard auth routes", () => {
  it("keeps login and logout same-origin protected", () => {
    for (const route of [
      "apps/dashboard/src/app/api/auth/login/route.ts",
      "apps/dashboard/src/app/api/auth/logout/route.ts",
    ]) {
      const source = readFileSync(route, "utf8");
      expect(source, route).toContain("requireSameOrigin");
      expect(source, route).toContain('sameSite: "strict"');
      expect(source, route).toContain('headers.set("Cache-Control", "no-store")');
    }
  });

  it("bounds and normalizes durable login lockout keys", () => {
    const source = readFileSync("apps/dashboard/src/app/api/auth/login/route.ts", "utf8");

    expect(source).toContain("clientKeyFromRequest");
    expect(source).toContain("GLOBAL_LOGIN_FAILURE_KEY");
    expect(source).toContain("x-vercel-forwarded-for");
    expect(source).not.toContain("Math.max(clientState.lockedUntilMs");
    expect(source).toContain("slice(0, 128)");
    expect(source).toContain("replace(/[^\\w:. -]/g");
  });

  it("keeps middleware security headers on protected responses", () => {
    const source = readFileSync("apps/dashboard/src/middleware.ts", "utf8");

    expect(source).toContain("withSecurityHeaders");
    expect(source).toContain('"X-Frame-Options", "DENY"');
    expect(source).toContain('"X-Content-Type-Options", "nosniff"');
    expect(source).toContain('"Referrer-Policy", "same-origin"');
    expect(source).toContain('"Content-Security-Policy", "frame-ancestors');
  });

  it("does not render dashboard navigation on the login page shell", () => {
    const source = readFileSync("apps/dashboard/src/app/dashboard-shell.tsx", "utf8");

    expect(source).toContain('pathname === "/login"');
    expect(source).toContain("Sign out");
  });
});
