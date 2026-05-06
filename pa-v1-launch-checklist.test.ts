import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("PA V1 launch checklist", () => {
  test("captures safe go-live gates for daily-use PA", () => {
    const source = readFileSync("docs/pa-v1-launch-checklist.md", "utf8");

    expect(source).toContain("V1 daily-use PA");
    expect(source).toContain("command_jobs");
    expect(source).toContain("Messy or emotional requests clarify before action");
    expect(source).toContain("No real outbound send/call/book/pay action without approval");
    expect(source).toContain("pnpm run release:preflight");
    expect(source).toContain("DATABASE_URL_DIRECT");
  });
});
