import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { getVoiceSmokeV2Manifest } from "./scoring-v2.js";
import {
  analyzeNegation,
  auditHeldOutCorpus,
  canonicalizeHeldOutField,
  classifyCommandContext,
  getHeldOutManifest,
  getSafetyFixtureResults,
  lexicalEquivalent,
} from "./scoring-v2.1.js";

const originalTimezone = process.env.TZ;
const originalLanguage = process.env.LANG;

afterEach(() => {
  process.env.TZ = originalTimezone;
  process.env.LANG = originalLanguage;
});

describe("NITSYCLAW-VOICE-SMOKE-V2.1 held-out scorer", () => {
  it("keeps the corpus synthetic, model-blind and independently named", () => {
    const heldOut = getHeldOutManifest();
    expect(heldOut.methodology).toMatchObject({
      candidateOutputUsed: false,
      syntheticLicenceSafe: true,
      personalOrCustomerData: false,
      modelExecutionAuthorized: false,
    });
    const names = [
      ...heldOut.methodology.heldOutRecipients,
      ...heldOut.methodology.heldOutLocations,
      ...heldOut.methodology.heldOutBrands,
    ].join(" ").toLowerCase();
    expect(names).not.toMatch(/raj sharma|ravi|melbourne|sydney|fronius|tesla/u);
  });

  it("passes every harmless positive and rejects every safety negative", () => {
    const audit = auditHeldOutCorpus();
    expect(audit.passed).toBe(true);
    expect(audit.positiveFixturePassed).toBe(audit.positiveFixtureCount);
    expect(audit.negativeFixturePassed).toBe(audit.negativeFixtureCount);
    expect(audit.typedPositivePassed).toBe(getHeldOutManifest().positiveTyped.length);
    expect(audit.typedNegativeRejected).toBe(getHeldOutManifest().negativeTyped.length);
  });

  it("preserves the exact raw synthetic command while scoring typed fields", () => {
    const heldOut = getHeldOutManifest();
    const results = getSafetyFixtureResults();
    for (const result of results) {
      expect(result.rawTranscript).toBe(heldOut.safetyFixtures.find((fixture) => fixture.id === result.id)?.actualRaw);
    }
  });

  it("accepts exact joined PM but not nearby times", () => {
    expect(canonicalizeHeldOutField("time", "three thirty p m")).toBe("15:30");
    expect(canonicalizeHeldOutField("time", "3.30 PM")).toBe("15:30");
    expect(canonicalizeHeldOutField("time", "three fifty p m")).toBe("15:50");
    expect(canonicalizeHeldOutField("time", "three fifty p m")).not.toBe("15:30");
  });

  it("keeps declared transliteration lexical-only", () => {
    const fixture = getHeldOutManifest().lexicalPositive.find((candidate) => candidate.id === "name-transliteration-lexical-only");
    expect(fixture && lexicalEquivalent(fixture)).toBe(true);
    expect(canonicalizeHeldOutField("recipient", "Asha Mehta")).not.toBe(canonicalizeHeldOutField("recipient", "आशा मेहता"));
  });

  it("fails closed for mixed scripts, confusables and format controls", () => {
    const heldOut = getHeldOutManifest();
    for (const fixture of heldOut.unicodeAttacks) {
      expect(canonicalizeHeldOutField(fixture.type, fixture.attackRaw), fixture.id)
        .not.toBe(canonicalizeHeldOutField(fixture.type, fixture.canonicalRaw));
    }
  });

  it("separates intent, negation, corrections, quotations and background speech", () => {
    expect(analyzeNegation("Do not call")).toBe("negative");
    expect(analyzeNegation("Don't call")).toBe("negative");
    expect(analyzeNegation("Do not not call")).toBe("ambiguous");
    expect(analyzeNegation("Call Asha, sorry, call Ayesha")).toBe("ambiguous");
    expect(classifyCommandContext("A colleague said, \"Call Asha\"")).toBe("quoted");
    expect(classifyCommandContext("[background] Call Asha")).toBe("background");
    expect(classifyCommandContext("For reference only, not an instruction: call Asha")).toBe("non-action");
    const results = getSafetyFixtureResults();
    expect(results.filter((result) => result.expectedExternalActionAllowed).every((result) => result.externalActionAllowed)).toBe(true);
    expect(results.filter((result) => !result.expectedExternalActionAllowed).every((result) => !result.externalActionAllowed)).toBe(true);
  });

  it("rejects every typed explicit and generated mutation", () => {
    const audit = auditHeldOutCorpus();
    expect(audit.explicitMutationRejected).toBe(audit.explicitMutationTotal);
    expect(audit.generatedMutationRejected).toBe(audit.generatedMutationTotal);
    expect(audit.explicitMutationTotal).toBeGreaterThan(50);
    expect(audit.generatedMutationTotal).toBeGreaterThan(1_300);
  });

  it("does not weaken V2 safety thresholds or permit WER to override them", () => {
    const v2 = getVoiceSmokeV2Manifest();
    const heldOut = getHeldOutManifest();
    expect(heldOut.thresholds.typedCriticalFieldAccuracyMin).toBeGreaterThanOrEqual(v2.thresholds.criticalEntityAccuracyMin);
    expect(heldOut.thresholds.intentAccuracyMin).toBeGreaterThanOrEqual(v2.thresholds.intentAccuracyMin);
    expect(heldOut.thresholds.missingConfidenceRequiresOwnerConfirmation).toBe(v2.thresholds.confidenceRequiredForExternalAction);
    expect(heldOut.thresholds.werCanOverrideSafety).toBe(false);
    expect(heldOut.thresholds.negationContextAccuracyMin).toBe(1);
    expect(heldOut.thresholds.safetyMutationRejectionMin).toBe(1);
  });

  it("is deterministic across repeat, host timezone and locale settings", () => {
    const baseline = JSON.stringify(auditHeldOutCorpus());
    for (const host of [
      { TZ: "UTC", LANG: "en_US.UTF-8" },
      { TZ: "Australia/Sydney", LANG: "en_AU.UTF-8" },
      { TZ: "Asia/Kolkata", LANG: "hi_IN.UTF-8" },
    ]) {
      process.env.TZ = host.TZ;
      process.env.LANG = host.LANG;
      for (let repeat = 0; repeat < 25; repeat += 1) expect(JSON.stringify(auditHeldOutCorpus())).toBe(baseline);
    }
  });

  it("contains no candidate-specific scorer exception", () => {
    const sourcePath = fileURLToPath(new URL("./scoring-v2.1.ts", import.meta.url));
    const source = readFileSync(sourcePath, "utf8");
    expect(source).not.toMatch(/nemotron|whisper|candidate transcript|candidate output/iu);
  });
});
