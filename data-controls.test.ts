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

  test("data control failure copy is user-safe", () => {
    const exportRoute = readFileSync("apps/dashboard/src/app/api/data/export/route.ts", "utf8");
    const deleteRoute = readFileSync("apps/dashboard/src/app/api/data/delete/route.ts", "utf8");

    expect(exportRoute).not.toContain("Check server logs");
    expect(deleteRoute).not.toContain("Check server logs");
    expect(exportRoute).toContain("Data export failed. Try again shortly.");
    expect(deleteRoute).toContain("Data deletion failed. Try again shortly.");
  });

  test("delete everything is transactional, audited, and backup guarded", () => {
    const route = readFileSync("apps/dashboard/src/app/api/data/delete/route.ts", "utf8");
    const settings = readFileSync("apps/dashboard/src/app/settings/page.tsx", "utf8");
    const exportRoute = readFileSync("apps/dashboard/src/app/api/data/export/route.ts", "utf8");

    expect(route).toContain("db.transaction");
    expect(route).toContain("tool: \"data_delete\"");
    expect(route).toContain("verifyExportProof");
    expect(route).toContain("currentPassword");
    expect(route).toContain("disconnectSpotify");
    expect(route).toContain("provider-revoke");
    expect(route).toContain("tx.delete(auditLog).returning");
    expect(route).toContain("tx.delete(dashboardAuthAttempts).returning");
    expect(settings).toContain("Export snapshot ID");
    expect(settings).toContain("Export proof");
    expect(settings).toContain("Current dashboard password");
    expect(settings).toContain("Connected providers are disconnected first");
    expect(settings).toContain("if local deletion then fails");
    expect(settings).toContain("/api/sale-readiness");
    expect(settings).toContain("Not ready to sell yet");
    expect(settings).toContain("Ready for customers");
    expect(exportRoute).toContain("snapshotId");
    expect(exportRoute).toContain("exportProof");
    expect(exportRoute).toContain("exportComplete");
    expect(exportRoute).toContain("dashboardAuthAttempts");
    expect(exportRoute).toContain("redactDashboardAuthAttemptRows");
    expect(exportRoute).toContain("limit(5001)");
    expect(exportRoute).toContain("limit(2001)");
  });
});
