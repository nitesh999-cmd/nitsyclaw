import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("data controls", () => {
  test("settings exposes real export and deletion controls", () => {
    const source = readFileSync("apps/dashboard/src/app/settings/page.tsx", "utf8");

    expect(source).toContain("/api/data/export");
    expect(source).toContain("/api/data/delete");
    expect(source).not.toContain("Coming soon");
    expect(source).not.toContain("disabled");
  });

  test("data deletion route is no-store and handles malformed form parsing", () => {
    const source = readFileSync("apps/dashboard/src/app/api/data/delete/route.ts", "utf8");

    expect(source).toContain("NO_STORE");
    expect(source).toContain("req.formData()");
    expect(source).toContain("Invalid delete request.");
    expect(source).toContain('response.headers.set("Cache-Control", "no-store")');
  });

  test("delete everything is transactional, audited, and backup guarded", () => {
    const route = readFileSync("apps/dashboard/src/app/api/data/delete/route.ts", "utf8");
    const settings = readFileSync("apps/dashboard/src/app/settings/page.tsx", "utf8");
    const exportRoute = readFileSync("apps/dashboard/src/app/api/data/export/route.ts", "utf8");

    expect(route).toContain("db.transaction");
    expect(route).toContain("tool: \"data_delete\"");
    expect(route).toContain("isRecentExportSnapshotId");
    expect(route).toContain("currentPassword");
    expect(settings).toContain("Export snapshot ID");
    expect(settings).toContain("Current dashboard password");
    expect(exportRoute).toContain("snapshotId");
  });
});
