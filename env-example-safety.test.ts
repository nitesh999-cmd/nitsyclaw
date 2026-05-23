import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("example environment file safety", () => {
  test("does not use real credential-shaped placeholder prefixes", () => {
    const source = readFileSync(".env.local.example", "utf8");

    expect(source).not.toMatch(/\b(?:ghp|github_pat|gho|ghu|ghs|ghr)_[A-Za-z0-9_]+/);
    expect(source).not.toMatch(/\bsk-ant-[A-Za-z0-9_-]+/);
    expect(source).not.toMatch(/\bsk-[A-Za-z0-9_-]+/);
  });

  test("documents the public beta interest email destination", () => {
    const source = readFileSync(".env.local.example", "utf8");

    expect(source).toContain("NEXT_PUBLIC_WAITLIST_EMAIL");
    expect(source).toContain("Used by /offer beta access mailto drafts");
  });
});
