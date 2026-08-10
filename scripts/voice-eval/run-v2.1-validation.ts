import { auditHeldOutCorpus, getHeldOutManifest, getSafetyFixtureResults } from "./scoring-v2.1.js";
import { verifyVoiceSmokeV2Freeze } from "./verify-v2-freeze.js";
import { verifyVoiceSmokeV21Freeze } from "./verify-v2.1-freeze.js";

async function main(): Promise<void> {
  const v2 = await verifyVoiceSmokeV2Freeze();
  const v21 = await verifyVoiceSmokeV21Freeze();
  const manifest = getHeldOutManifest();
  const audit = auditHeldOutCorpus();
  const safetyFixtures = getSafetyFixtureResults();
  const rejectedSafetyFixtures = safetyFixtures
    .filter((result) => !result.expectedExternalActionAllowed)
    .map((result) => ({ id: result.id, rejected: !result.externalActionAllowed, context: result.context, negation: result.negation }));
  const failedSafetyFixtures = safetyFixtures.filter((result) => !result.passed);

  console.log(JSON.stringify({
    schemaVersion: manifest.schemaVersion,
    priorV2AggregateSha256: v2.aggregateSha256,
    heldOutV21AggregateSha256: v21.aggregateSha256,
    thresholds: manifest.thresholds,
    audit,
    failedSafetyFixtures,
    rejectedSafetyFixtures,
  }, null, 2));

  if (!audit.passed) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "V2.1 validation failed.");
  process.exitCode = 1;
});
