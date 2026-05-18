import { readFileSync } from "node:fs";

import {
  TENANT_TABLE_BOUNDARIES,
  tableRequiresTenantMigration,
} from "@nitsyclaw/shared/tenancy";

const planPath = "docs/tenant-boundary-migration-plan.md";
const plan = readFileSync(planPath, "utf8");
const missingTables = TENANT_TABLE_BOUNDARIES
  .filter((table) => tableRequiresTenantMigration(table.table))
  .map((table) => table.table)
  .filter((table) => !plan.includes(`\`${table}\``));

const forbiddenPatterns = [
  /\bDROP\s+TABLE\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bCASCADE\b/i,
];
const forbidden = forbiddenPatterns.filter((pattern) => pattern.test(plan));

console.log(`tenant_migration_plan=${planPath}`);
console.log(`blocked_tables_covered=${missingTables.length === 0 ? "yes" : "no"}`);
console.log(`destructive_sql_detected=${forbidden.length === 0 ? "no" : "yes"}`);

if (missingTables.length > 0) {
  console.error(`missing_blocked_tables=${missingTables.join(",")}`);
  process.exitCode = 1;
}

if (forbidden.length > 0) {
  console.error("tenant migration plan contains destructive SQL wording");
  process.exitCode = 1;
}
