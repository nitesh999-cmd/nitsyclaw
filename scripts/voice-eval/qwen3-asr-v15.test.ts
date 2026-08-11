import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseScoredAdapterPayload } from "./run-qwen3-asr-v15-scored-smoke.js";
import { verifyQwen3AsrV15Freeze } from "./verify-qwen3-asr-v15-freeze.js";

const runnerPath = fileURLToPath(new URL("./run-qwen3-asr-v15-scored-smoke.ts", import.meta.url));
const adapterPath = fileURLToPath(new URL("./qwen3-asr-adapter-v14.py", import.meta.url));

function validPayload(caseIds = ["english-solar-au", "hinglish-business"]): Record<string, unknown> {
  return {
    schemaVersion: "NITSYCLAW-QWEN3-ASR-ADAPTER-V1.1",
    status: "ok",
    mode: "scored",
    modelRevision: "7278e1e70fe206f11671096ffdd38061171dd6e5",
    cases: caseIds.map((caseId) => ({
      caseId,
      rawTranscript: `synthetic transcript for ${caseId}`,
      modelLanguage: caseId === "english-solar-au" ? "English" : "Hindi",
      providerConfidence: null,
      latencyMs: 1_000,
    })),
    cleanup: { cudaAllocatedBytes: 0, cudaReservedBytes: 0 },
    networkPolicy: { pythonSocketAccess: "denied-before-third-party-imports" },
    confidenceTelemetry: "unavailable",
    providerConfidence: null,
  };
}

describe("Qwen3-ASR V1.5 scored two-case freeze", () => {
  it("freezes the exact model, runtime, fixtures, thresholds and one-child policy", async () => {
    const frozen = await verifyQwen3AsrV15Freeze();
    expect(frozen.model.bytes).toBe(4_703_114_308);
    expect(frozen.model.files).toHaveLength(12);
    expect(frozen.runtime.device).toBe("cuda:0");
    expect(frozen.runtime.dtype).toBe("bfloat16");
    expect(frozen.cases.map((item) => item.caseId)).toEqual(["english-solar-au", "hinglish-business"]);
    expect(frozen.thresholds).toEqual({
      englishWerMax: 0.2,
      hinglishWerMax: 0.4,
      criticalEntityAccuracyMin: 1,
      intentAccuracyMin: 1,
      negationAccuracyMin: 1,
      languageAccuracyMin: 1,
      clipLatencyMsMax: 45_000,
      cleanupRequired: true,
      confidenceRequiredForExternalAction: true,
    });
    expect(frozen.policy).toMatchObject({
      diagnosticChildAuthorized: false,
      scoredChildCount: 1,
      scoredCases: 2,
      scorerExecutions: 1,
      retryAuthorized: false,
      externalActionAllowed: false,
      missingConfidence: null,
      werCannotOverrideSafetyFailure: true,
    });
  });

  it("has no diagnostic, retry or runtime-option route in the scored runner", async () => {
    const source = await readFile(runnerPath, "utf8");
    expect(source).toContain("process.argv.length !== 2");
    expect(source).toContain('"--mode", "scored"');
    expect(source).toContain("modelChildCount: 1");
    expect(source).toContain("retryCount: 0");
    expect(source).toContain("runBoundedUtf8JsonProcess");
    expect(source).not.toContain('"--mode", "diagnostic"');
    expect(source).not.toMatch(/\b(?:retry|attempt)\s*\+=/u);
  });

  it("retains exactly two cases in the frozen scored adapter mode", async () => {
    const source = await readFile(adapterPath, "utf8");
    expect(source).toContain('args.mode == "scored" and len(args.case) != 2');
    expect(source).toContain('raise ValueError("scored mode requires exactly two cases")');
    expect(source).not.toContain('device_map="auto"');
  });

  it("accepts only the exact English-first, Hinglish-second payload correlation", () => {
    expect(parseScoredAdapterPayload(validPayload()).cases?.map((item) => item.caseId)).toEqual([
      "english-solar-au", "hinglish-business",
    ]);
    expect(() => parseScoredAdapterPayload(validPayload(["hinglish-business", "english-solar-au"])))
      .toThrow("case order or correlation failed");
    expect(() => parseScoredAdapterPayload(validPayload(["english-solar-au"])))
      .toThrow("invalid scored result");
  });

  it("preserves null confidence and rejects any manufactured value", () => {
    const payload = validPayload();
    (payload.cases as Array<Record<string, unknown>>)[0]!.providerConfidence = 0.99;
    expect(() => parseScoredAdapterPayload(payload)).toThrow("invalid case result");
  });

  it("scores only after the bounded child has returned and persists fail-closed evidence", async () => {
    const source = await readFile(runnerPath, "utf8");
    const childIndex = source.indexOf("processResult = await runBoundedUtf8JsonProcess");
    const scorerIndex = source.indexOf("scoreQwenSmokeV21({", childIndex);
    const resultIndex = source.indexOf("writeQwenDiagnosticAtomically(resultPath", scorerIndex);
    expect(childIndex).toBeGreaterThan(0);
    expect(scorerIndex).toBeGreaterThan(childIndex);
    expect(resultIndex).toBeGreaterThan(scorerIndex);
    expect(source).toContain("scores.every((score) => score.passed && score.frozenV21.safetyPassed");
    expect(source).toContain("externalActionAllowed: false");
  });
});
