import { describe, expect, it } from "vitest";
import {
  canonicalizeTypedValue,
  getVoiceSmokeV2Case,
  getVoiceSmokeV2Manifest,
  scoreVoiceSmokeV2,
  validateVoiceSmokeV2Manifest,
  voiceSmokeV2Internals,
} from "./scoring-v2.js";
import {
  v1Alignment,
  v1EntityAccuracy,
  v1NormalizedWords,
  v1WordErrorRate,
} from "./scoring-v1.js";

const ENGLISH_REFERENCE = "Please call Raj Sharma in Melbourne tomorrow at three thirty P M about the ten kilowatt Fronius solar inverter.";
const ENGLISH_WHISPER = "Please call Raj Sharma in Melbourne tomorrow at 3.30pm about the 10kW Fronius solar inverter.";
const HINGLISH_REFERENCE = "Kal subah Ravi ko Sydney mein call karna aur Tesla Powerwall three ka quote fifteen percent discount ke saath check karna.";
const HINGLISH_WHISPER = "कल सुबह रवे को सिडनी में कॉल कना ओयल टेसला पववल 3 का 15% डिसकाउंट के साथ चेक कना";

describe("V1 scorer forensic preservation", () => {
  it("reproduces the committed Whisper scores exactly", () => {
    expect(v1NormalizedWords(ENGLISH_REFERENCE)).toHaveLength(19);
    expect(v1WordErrorRate(ENGLISH_REFERENCE, ENGLISH_WHISPER)).toBe(6 / 19);
    expect(Number(v1WordErrorRate(ENGLISH_REFERENCE, ENGLISH_WHISPER).toFixed(3))).toBe(0.316);
    expect(v1EntityAccuracy(["raj", "sharma", "melbourne", "three", "thirty", "ten", "kilowatt", "fronius"], ENGLISH_WHISPER)).toBe(0.5);

    expect(v1NormalizedWords(HINGLISH_REFERENCE)).toHaveLength(21);
    expect(v1WordErrorRate(HINGLISH_REFERENCE, HINGLISH_WHISPER)).toBe(28 / 21);
    expect(Number(v1WordErrorRate(HINGLISH_REFERENCE, HINGLISH_WHISPER).toFixed(3))).toBe(1.333);
    expect(v1EntityAccuracy(["ravi", "sydney", "tesla", "powerwall", "three", "fifteen", "percent"], HINGLISH_WHISPER)).toBe(0);
  });

  it("accounts for every English V1 edit contribution", () => {
    const edits = v1Alignment(ENGLISH_REFERENCE, ENGLISH_WHISPER).filter((operation) => operation.kind !== "equal");
    expect(edits).toHaveLength(6);
    expect(edits).toEqual([
      { kind: "delete", expected: "three", actual: null },
      { kind: "delete", expected: "thirty", actual: null },
      { kind: "substitute", expected: "p", actual: "3" },
      { kind: "substitute", expected: "m", actual: "30pm" },
      { kind: "delete", expected: "ten", actual: null },
      { kind: "substitute", expected: "kilowatt", actual: "10kw" },
    ]);
  });
});

describe("frozen V2 typed equivalence contract", () => {
  it("is internally valid and keeps exactly the two authorized smoke cases", () => {
    const manifest = getVoiceSmokeV2Manifest();
    expect(manifest.schemaVersion).toBe("NITSYCLAW-VOICE-SMOKE-V2");
    expect(manifest.cases.map((item) => item.id)).toEqual(["english-solar-au", "hinglish-business"]);
    expect(validateVoiceSmokeV2Manifest()).toEqual([]);
  });

  it("accepts only the declared typed equivalences", () => {
    for (const fixture of getVoiceSmokeV2Manifest().typedEquivalenceFixtures) {
      const left = canonicalizeTypedValue(fixture.type, fixture.left);
      const right = canonicalizeTypedValue(fixture.type, fixture.right);
      expect(left === right, fixture.id).toBe(fixture.equal);
      if (fixture.equal) expect(left, fixture.id).not.toBeNull();
    }
  });

  it("keeps Unicode confusables distinct at the critical identity boundary", () => {
    expect(canonicalizeTypedValue("name", "Ravi")).toBe("ravi");
    expect(canonicalizeTypedValue("name", "Rаvi")).not.toBe("ravi");
  });
});

describe("V2 lexical, language, and safety channels", () => {
  it("passes the model-blind benign formatting and deterministic script fixtures", () => {
    for (const fixture of getVoiceSmokeV2Manifest().positiveSafetyFixtures) {
      const score = scoreVoiceSmokeV2({ caseId: fixture.caseId, transcript: fixture.transcript });
      expect(score.passed, fixture.id).toBe(true);
      expect(score.safetyPassed, fixture.id).toBe(true);
      expect(score.wordErrorRate, fixture.id).toBe(0);
      expect(score.confirmationRequired, fixture.id).toBe(true);
      expect(score.rawTranscript, fixture.id).toBe(fixture.transcript);
    }
  });

  it("rejects every frozen safety-critical near-match", () => {
    for (const fixture of getVoiceSmokeV2Manifest().adversarialSafetyFixtures) {
      const score = scoreVoiceSmokeV2({ caseId: fixture.caseId, transcript: fixture.transcript });
      expect(score.safetyPassed, fixture.id).toBe(false);
      expect(score.passed, fixture.id).toBe(false);
    }
  });

  it("never lets a passing aggregate WER override a recipient failure", () => {
    const score = scoreVoiceSmokeV2({
      caseId: "hinglish-business",
      transcript: "Kal subah Rave ko Sydney mein call karna aur Tesla Powerwall 3 ka quote 15 percent discount ke saath check karna.",
    });
    expect(score.wordErrorRate).toBeLessThanOrEqual(0.4);
    expect(score.lexicalPassed).toBe(true);
    expect(score.criticalEntities.find((entity) => entity.id === "recipient")?.passed).toBe(false);
    expect(score.safetyPassed).toBe(false);
    expect(score.passed).toBe(false);
  });

  it.each(["don't", "don’t", "cant", "can't", "won't"])('fails closed on the negation contraction "%s"', (negation) => {
    const transcript = ENGLISH_REFERENCE.replace("Please call", `Please ${negation} call`);
    const score = scoreVoiceSmokeV2({ caseId: "english-solar-au", transcript });
    expect(score.negation.observed).toBe("present");
    expect(score.negation.passed).toBe(false);
    expect(score.safetyPassed).toBe(false);
  });

  it("reports script independently from language", () => {
    expect(voiceSmokeV2Internals.languageAndScript(ENGLISH_WHISPER)).toEqual({ observed: "english", script: "latin" });
    expect(voiceSmokeV2Internals.languageAndScript("Kal सुबह Ravi को call karna")).toEqual({ observed: "hinglish", script: "mixed" });
    expect(voiceSmokeV2Internals.languageAndScript("कल सुबह रवि को कॉल करना")).toEqual({ observed: "hinglish", script: "devanagari" });
  });
});

describe("V2 mutation and property safety", () => {
  it("rejects every declared critical-entity and intent mutation", () => {
    let mutations = 0;
    for (const testCase of getVoiceSmokeV2Manifest().cases) {
      for (const entity of testCase.criticalEntities) {
        for (const replacement of entity.rejectForms) {
          const transcript = testCase.reference.replace(entity.forms[0]!, replacement);
          expect(transcript, `${testCase.id}/${entity.id}/${replacement}`).not.toBe(testCase.reference);
          const score = scoreVoiceSmokeV2({ caseId: testCase.id, transcript });
          expect(score.safetyPassed, `${testCase.id}/${entity.id}/${replacement}`).toBe(false);
          mutations += 1;
        }
      }
      for (const intent of testCase.intents) {
        for (const replacement of intent.rejectForms) {
          const transcript = testCase.reference.replace(intent.forms[0]!, replacement);
          expect(transcript, `${testCase.id}/${intent.id}/${replacement}`).not.toBe(testCase.reference);
          expect(scoreVoiceSmokeV2({ caseId: testCase.id, transcript }).safetyPassed).toBe(false);
          mutations += 1;
        }
      }
    }
    expect(mutations).toBeGreaterThanOrEqual(30);
  });

  it("cannot normalize changed action-critical numeric values back to the expected value", () => {
    let mutations = 0;
    for (let value = 0; value <= 99; value += 1) {
      if (value !== 15) {
        const transcript = HINGLISH_REFERENCE.replace("fifteen percent", `${value} percent`);
        expect(scoreVoiceSmokeV2({ caseId: "hinglish-business", transcript }).safetyPassed, `discount=${value}`).toBe(false);
        mutations += 1;
      }
    }
    for (let minute = 0; minute <= 59; minute += 1) {
      if (minute !== 30) {
        const transcript = ENGLISH_REFERENCE.replace("three thirty P M", `3:${String(minute).padStart(2, "0")} pm`);
        expect(scoreVoiceSmokeV2({ caseId: "english-solar-au", transcript }).safetyPassed, `minute=${minute}`).toBe(false);
        mutations += 1;
      }
    }
    for (let power = 1; power <= 20; power += 1) {
      if (power !== 10) {
        const transcript = ENGLISH_REFERENCE.replace("ten kilowatt", `${power} kW`);
        expect(scoreVoiceSmokeV2({ caseId: "english-solar-au", transcript }).safetyPassed, `power=${power}`).toBe(false);
        mutations += 1;
      }
    }
    for (let version = 1; version <= 10; version += 1) {
      if (version !== 3) {
        const transcript = HINGLISH_REFERENCE.replace("Powerwall three", `Powerwall ${version}`);
        expect(scoreVoiceSmokeV2({ caseId: "hinglish-business", transcript }).safetyPassed, `powerwall=${version}`).toBe(false);
        mutations += 1;
      }
    }
    expect(mutations).toBe(186);
  });

  it("preserves the references and never mutates the loaded manifest", () => {
    const first = getVoiceSmokeV2Case("english-solar-au");
    first.reference = "mutated in caller";
    expect(getVoiceSmokeV2Case("english-solar-au").reference).toBe(ENGLISH_REFERENCE);
    expect(getVoiceSmokeV2Case("hinglish-business").reference).toBe(HINGLISH_REFERENCE);
  });
});
