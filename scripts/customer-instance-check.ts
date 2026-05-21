import { evaluateCustomerInstanceReadiness } from "@nitsyclaw/shared/customer-instance";

const mode = process.env.NITSYCLAW_CUSTOMER_INSTANCE_MODE === "customer" ? "customer" : "private-owner";
const stage = process.env.NITSYCLAW_CUSTOMER_INSTANCE_STAGE === "public-sale"
  ? "public-sale"
  : process.env.NITSYCLAW_CUSTOMER_INSTANCE_STAGE === "pilot"
    ? "pilot"
    : "personal";

const readiness = evaluateCustomerInstanceReadiness({
  instanceId: process.env.NITSYCLAW_CUSTOMER_INSTANCE_ID,
  ownerHash: process.env.NITSYCLAW_CUSTOMER_OWNER_HASH,
  displayName: process.env.NITSYCLAW_CUSTOMER_DISPLAY_NAME,
  mode,
  stage,
});

console.log(`customer_instance=${readiness.instance.instanceId}`);
console.log(`customer_stage=${readiness.instance.stage}`);
console.log(`customer_mode=${readiness.instance.mode}`);
console.log(`can_use_for_personal=${readiness.canUseForPersonal ? "yes" : "no"}`);
console.log(`can_pilot_with_human_setup=${readiness.canPilotWithHumanSetup ? "yes" : "no"}`);
console.log(`can_sell_publicly=${readiness.canSellPublicly ? "yes" : "no"}`);
console.log(`blockers=${readiness.blockers.length}`);

for (const blocker of readiness.blockers.slice(0, 8)) {
  console.log(`- ${blocker}`);
}

if (readiness.instance.stage === "public-sale" && !readiness.canSellPublicly) {
  process.exitCode = 1;
}
