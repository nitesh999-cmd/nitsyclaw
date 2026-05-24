import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_ROOTS = ["apps", "packages"];
const CUSTOMER_TABLES = ["memories", "reminders", "expenses", "briefs", "confirmations"] as const;
const OPERATIONS = ["from", "insert", "update", "delete"] as const;
const SKIP_PARTS = [
  `${join("packages", "shared", "src", "db", "schema.ts")}`,
  `${join("packages", "shared", "src", "tenancy.ts")}`,
  ".test.ts",
  ".test.tsx",
  `${join("test", "")}`,
];

type CustomerTable = (typeof CUSTOMER_TABLES)[number];
type Operation = (typeof OPERATIONS)[number];
type Priority = "critical" | "high" | "medium";

interface Finding {
  file: string;
  table: CustomerTable;
  operation: Operation;
  count: number;
  priority: Priority;
  guarded: boolean;
}

function shouldSkip(file: string): boolean {
  const normalized = file.replaceAll("\\", "/");
  return SKIP_PARTS.some((part) => normalized.includes(part.replaceAll("\\", "/")));
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (["node_modules", ".next", "dist", "coverage", "test-results"].includes(entry)) continue;
      out.push(...listSourceFiles(full));
      continue;
    }
    if ((full.endsWith(".ts") || full.endsWith(".tsx")) && !shouldSkip(full)) out.push(full);
  }
  return out;
}

function countMatches(source: string, table: CustomerTable, operation: Operation): number {
  const compactSource = source.replace(/\s+/g, "");
  const needle = `${operation}(${table})`;
  return compactSource.split(needle).length - 1;
}

function priorityFor(file: string, operation: Operation): Priority {
  if (operation === "delete") return "critical";
  if (file.includes("/api/data/") || file.includes("/api/expenses/export")) return "critical";
  if (operation === "insert" || operation === "update") return "high";
  if (file.includes("/api/")) return "high";
  return "medium";
}

function findUnscopedAccess(): Finding[] {
  const findings: Finding[] = [];
  for (const root of SCAN_ROOTS) {
    const rootPath = join(ROOT, root);
    for (const file of listSourceFiles(rootPath)) {
      const source = readFileSync(file, "utf8");
      const guarded = source.includes("blockPublicSaleCustomerDataAccess")
        || source.includes("guardUnscopedCustomerDataAccess")
        || source.includes("assertPublicSaleTenantBoundaries");
      for (const table of CUSTOMER_TABLES) {
        for (const operation of OPERATIONS) {
          const count = countMatches(source, table, operation);
          if (count > 0) {
            findings.push({
              file: relative(ROOT, file).replaceAll("\\", "/"),
              table,
              operation,
              count,
              priority: priorityFor(relative(ROOT, file).replaceAll("\\", "/"), operation),
              guarded,
            });
          }
        }
      }
    }
  }
  return findings.sort((a, b) => `${a.file}:${a.table}:${a.operation}`.localeCompare(`${b.file}:${b.table}:${b.operation}`));
}

const findings = findUnscopedAccess();
console.log(`tenant_access_inventory=${findings.length > 0 ? "findings" : "clear"}`);
console.log(`findings=${findings.length}`);

for (const finding of findings) {
  console.log(`priority=${finding.priority} guarded=${finding.guarded ? "yes" : "no"} file=${finding.file} table=${finding.table} operation=${finding.operation} count=${finding.count}`);
}
