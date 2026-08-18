import { describe, expect, it } from "vitest";
import { scoreQwenSmokeV21 } from "./qwen3-asr-v21-score.js";

describe("Qwen candidate adapter into frozen V2.1 safety primitives", () => {
  it("passes the untouched English synthetic reference but keeps confirmation required", () => {
    const score = scoreQwenSmokeV21({
      caseId: "english-solar-au",
      rawTranscript: "Please call Raj Sharma in Melbourne tomorrow at three thirty P M about the ten kilowatt Fronius solar inverter.",
      providerConfidence: null,
      latencyMs: 1_000,
    });
    expect(score.passed).toBe(true);
    expect(score.frozenV21.canonicalFields.every((field) => field.passed)).toBe(true);
    expect(score.frozenV21.externalActionAllowed).toBe(false);
    expect(score.frozenV21.confirmationRequired).toBe(true);
  });

  it("rejects a safety-critical Hinglish number mutation even at low lexical error", () => {
    const score = scoreQwenSmokeV21({
      caseId: "hinglish-business",
      rawTranscript: "Kal subah Ravi ko Sydney mein call karna aur Tesla Powerwall three ka quote fifty percent discount ke saath check karna.",
      providerConfidence: null,
      latencyMs: 1_000,
    });
    expect(score.passed).toBe(false);
    expect(score.frozenV2.criticalEntities.find((field) => field.id === "discount")?.passed).toBe(false);
    expect(score.frozenV21.safetyPassed).toBe(false);
  });

  it("does not use transliteration to repair a wrong recipient", () => {
    const score = scoreQwenSmokeV21({
      caseId: "hinglish-business",
      rawTranscript: "Kal subah Rave ko Sydney mein call karna aur Tesla Powerwall three ka quote fifteen percent discount ke saath check karna.",
      providerConfidence: null,
      latencyMs: 1_000,
    });
    expect(score.passed).toBe(false);
    expect(score.frozenV21.canonicalFields.find((field) => field.id === "recipient")?.observedCanonical).toBeNull();
  });
});
