import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("release war room page", () => {
  test("surfaces deploy proof, unresolved risks, and rollback notes", () => {
    const source = readFileSync("apps/dashboard/src/app/release/page.tsx", "utf8");

    expect(source).toContain("Release war room");
    expect(source).toContain("Post-deploy proof");
    expect(source).toContain("Open P0/P1 risk");
    expect(source).toContain("Rollback notes");
    expect(source).toContain("pnpm run release:post-deploy-proof");
    expect(source).toContain("/whatsapp-recovery");

    const helper = readFileSync("apps/dashboard/src/lib/release-war-room.ts", "utf8");
    expect(helper).toContain("proof test");
    expect(helper).toContain("release:wait-railway");
  });

  test("is linked from the dashboard advanced navigation", () => {
    const source = readFileSync("apps/dashboard/src/app/dashboard-shell.tsx", "utf8");

    expect(source).toContain('href: "/release"');
    expect(source).toContain('label: "Release"');
  });
});
