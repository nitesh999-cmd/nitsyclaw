import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard security headers", () => {
  test("proxy sets a real CSP for personal-data dashboard pages", () => {
    const source = readFileSync("apps/dashboard/src/proxy.ts", "utf8");

    expect(source).toContain('"Content-Security-Policy"');
    expect(source).toContain("default-src 'self'");
    expect(source).toContain("base-uri 'self'");
    expect(source).toContain("form-action 'self'");
    expect(source).toContain("frame-ancestors 'none'");
    expect(source).toContain("object-src 'none'");
    expect(source).toContain("img-src 'self' data: blob:");
    expect(source).toContain("connect-src 'self'");
    expect(source).toContain("manifest-src 'self'");
  });
});
