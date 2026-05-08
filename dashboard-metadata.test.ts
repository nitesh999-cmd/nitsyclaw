import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard metadata", () => {
  it("positions the app as a private personal PA without indexing private pages", () => {
    const source = readFileSync("apps/dashboard/src/app/layout.tsx", "utf8");

    expect(source).toContain("Private Personal PA");
    expect(source).toContain("private personal PA");
    expect(source).toContain("NEXT_PUBLIC_SITE_URL");
    expect(source).toContain("openGraph");
    expect(source).toContain("twitter");
    expect(source).toContain("index: false");
    expect(source).toContain("follow: false");
  });
});
