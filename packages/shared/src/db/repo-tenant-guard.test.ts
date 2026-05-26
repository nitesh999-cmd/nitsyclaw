import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const guardedRepoFunctions = [
  "insertMemory",
  "searchMemoriesLexical",
  "updateMemory",
  "deleteMemory",
  "insertReminder",
  "dueReminders",
  "listPendingReminders",
  "markReminderFired",
  "cancelReminder",
  "rescheduleReminder",
  "insertExpense",
  "expensesBetween",
  "recentExpensesBetween",
  "upsertBrief",
  "insertConfirmation",
  "setConfirmationStatus",
  "restorePendingConfirmation",
  "getLatestPendingConfirmation",
  "pruneExpiredConfirmations",
];

describe("repo tenant guard", () => {
  const source = readFileSync("packages/shared/src/db/repo.ts", "utf8");

  it("uses the tenant readiness gate before unscoped customer-data table access", () => {
    expect(source).toContain("type TenantContext");
    expect(source).toContain("requireTenantContext");
    expect(source).toContain("assertPublicSaleTenantBoundaries");
    expect(source).toContain("guardUnscopedCustomerDataAccess");

    for (const functionName of guardedRepoFunctions) {
      const start = source.indexOf(`function ${functionName}`);
      expect(start, `${functionName} should exist`).toBeGreaterThan(0);
      const nextExport = source.indexOf("\nexport ", start + 1);
      const body = source.slice(start, nextExport === -1 ? undefined : nextExport);

      expect(body, `${functionName} should guard before DB access`).toContain("guardUnscopedCustomerDataAccess(tenant);");
      expect(body, `${functionName} should require explicit tenant context`).toContain("tenant: TenantContext");
    }
  });
});
