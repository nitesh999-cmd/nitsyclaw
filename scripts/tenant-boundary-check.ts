import { evaluateTenantBoundaries } from "@nitsyclaw/shared/tenancy";

const readiness = evaluateTenantBoundaries();

console.log(`tenant_mode=${readiness.mode}`);
console.log(`code_ready_for_public_sale=${readiness.codeReadyForPublicSale ? "yes" : "no"}`);
console.log(`safe_for_public_sale=${readiness.safeForPublicSale ? "yes" : "no"}`);
console.log(`blockers=${readiness.blockers.length}`);

for (const table of readiness.tableBoundaries) {
  console.log(`${table.table}=${table.publicSaleRisk}:${table.scopeColumn ?? "unscoped"}`);
}

readiness.nextActions.forEach((action, index) => {
  console.log(`next_action_${index + 1}=${action}`);
});

if (readiness.mode === "public-sale" && !readiness.safeForPublicSale) {
  process.exitCode = 1;
}
