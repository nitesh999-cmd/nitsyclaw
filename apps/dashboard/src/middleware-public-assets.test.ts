import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard middleware public assets", () => {
  it("keeps PWA assets public so mobile login does not stall on manifest/icon requests", () => {
    const source = readFileSync("apps/dashboard/src/middleware.ts", "utf8");

    expect(source).toContain('pathname === "/manifest.json"');
    expect(source).toContain('pathname === "/icon.svg"');
  });
});
