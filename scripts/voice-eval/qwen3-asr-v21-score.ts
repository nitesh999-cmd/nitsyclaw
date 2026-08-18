import {
  analyzeNegation,
  canonicalizeHeldOutField,
  classifyCommandContext,
  type HeldOutFieldType,
} from "./scoring-v2.1.js";
import { getVoiceSmokeV2Case, scoreVoiceSmokeV2 } from "./scoring-v2.js";

const entityTypes: Readonly<Partial<Record<string, HeldOutFieldType>>> = Object.freeze({
  name: "recipient",
  location: "location",
  brand: "product",
  model: "model",
  percentage: "percentage",
  power: "power",
  time: "time",
});

function surface(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}%:+.-]+/gu, " ").trim();
}

function matchedForm(rawTranscript: string, forms: string[]): string | null {
  const actual = ` ${surface(rawTranscript)} `;
  return forms.find((form) => actual.includes(` ${surface(form)} `)) ?? null;
}

export function scoreQwenSmokeV21(input: {
  caseId: string;
  rawTranscript: string;
  providerConfidence: null;
  latencyMs: number;
}) {
  const testCase = getVoiceSmokeV2Case(input.caseId);
  const frozenV2 = scoreVoiceSmokeV2({
    caseId: input.caseId,
    transcript: input.rawTranscript,
    providerConfidence: input.providerConfidence,
    latencyMs: input.latencyMs,
  });
  const canonicalFields = testCase.criticalEntities.map((entity) => {
    const v21Type = entityTypes[entity.type];
    const observedRaw = matchedForm(input.rawTranscript, entity.forms);
    if (!v21Type) {
      return {
        id: entity.id,
        type: entity.type,
        scorer: "frozen-v2-exact" as const,
        observedRaw,
        observedCanonical: observedRaw ? entity.canonical : null,
        expectedCanonical: entity.canonical,
        passed: frozenV2.criticalEntities.find((item) => item.id === entity.id)?.passed === true,
      };
    }
    const expected = canonicalizeHeldOutField(v21Type, entity.forms[0] ?? "");
    const observed = observedRaw ? canonicalizeHeldOutField(v21Type, observedRaw) : null;
    return {
      id: entity.id,
      type: v21Type,
      scorer: "frozen-v2.1-canonicalizer" as const,
      observedRaw,
      observedCanonical: observed,
      expectedCanonical: expected,
      passed: expected !== null && observed === expected &&
        frozenV2.criticalEntities.find((item) => item.id === entity.id)?.passed === true,
    };
  });
  const canonicalActions = testCase.intents.map((intent) => {
    const observedRaw = matchedForm(input.rawTranscript, intent.forms);
    const v2Passed = frozenV2.intents.find((item) => item.id === intent.id)?.passed === true;
    const observed = observedRaw ? canonicalizeHeldOutField("action", observedRaw) : null;
    const expected = canonicalizeHeldOutField("action", intent.forms[0] ?? "");
    const supportedByV21 = observed !== null && expected !== null;
    return {
      id: intent.id,
      scorer: supportedByV21 ? "frozen-v2.1-canonicalizer" as const : "frozen-v2-exact" as const,
      observedRaw,
      observedCanonical: supportedByV21 ? observed : observedRaw,
      expectedCanonical: supportedByV21 ? expected : intent.id,
      passed: v2Passed && (supportedByV21 ? observed === expected : observedRaw !== null),
    };
  });
  const context = classifyCommandContext(input.rawTranscript);
  const negation = analyzeNegation(input.rawTranscript);
  const v21SafetyPassed = canonicalFields.every((field) => field.passed) &&
    canonicalActions.every((action) => action.passed) && context === "direct" &&
    negation === "affirmative" && frozenV2.safetyPassed;
  return {
    caseId: input.caseId,
    rawTranscript: input.rawTranscript,
    frozenV2,
    frozenV21: {
      canonicalFields,
      canonicalActions,
      context,
      negation,
      safetyPassed: v21SafetyPassed,
      externalActionAllowed: false,
      confirmationRequired: true,
    },
    passed: frozenV2.passed && v21SafetyPassed,
  };
}
