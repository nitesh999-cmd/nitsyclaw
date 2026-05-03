import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dependency lock guard", () => {
  test("keeps Vitest on the patched Vite 6 transformer line", () => {
    const lockfile = readFileSync("pnpm-lock.yaml", "utf8");

    expect(lockfile).toContain("@vitest/mocker@2.1.9(vite@6.4.2");
    expect(lockfile).toContain("vite-node@2.1.9");
    expect(lockfile).not.toContain("@vitest/mocker@2.1.9(vite@8.");
    expect(lockfile).not.toContain("vite-node@2.1.9(@types/node@22.19.17)(esbuild@0.27.7");
  });
});
