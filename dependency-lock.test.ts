import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dependency lock guard", () => {
  test("keeps Vitest on the patched Vite 6 transformer line", () => {
    const lockfile = readFileSync("pnpm-lock.yaml", "utf8");

    expect(lockfile).toContain("@vitest/mocker@4.1.0(vite@6.4.2");
    expect(lockfile).toContain("vitest@4.1.0");
    expect(lockfile).not.toContain("@vitest/mocker@4.1.0(vite@8.");
    expect(lockfile).not.toContain("vitest@2.");
    expect(lockfile).not.toContain("basic-ftp@5.3.0");
    expect(lockfile).toContain("basic-ftp@5.3.1");
  });
});
