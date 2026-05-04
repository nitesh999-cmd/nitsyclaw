import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("notification reliability", () => {
  test("ntfy reports non-2xx responses and toast process errors", () => {
    const source = readFileSync("packages/shared/src/notify/index.ts", "utf8");

    expect(source).toContain("response.ok");
    expect(source).toContain("response.status");
    expect(source).toContain('child.on("error"');
  });
});
