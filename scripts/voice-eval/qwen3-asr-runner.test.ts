import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const runnerPath = fileURLToPath(new URL("./run-qwen3-asr-smoke.ts", import.meta.url));

describe("Qwen3-ASR V1.1 runner authorization boundary", () => {
  it("fails closed before scored inference when the frozen causal gate is false", async () => {
    const source = await readFile(runnerPath, "utf8");
    const gate = source.indexOf('if (mode === "scored" && !frozenQwen.diagnosticPolicy.scoredRunAuthorized)');
    const modelVerification = source.indexOf("const modelWeightSha256 = await verifyModel(modelPath)");
    const processSubmission = source.indexOf("processResult = await runBoundedJsonProcess");
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(modelVerification);
    expect(gate).toBeLessThan(processSubmission);
    expect(source).toContain("causal inference failure was not established");
  });

  it("keeps diagnostic and scored modes explicit and separate", async () => {
    const source = await readFile(runnerPath, "utf8");
    expect(source).toContain('args.length !== 2 || args[0] !== "--mode"');
    expect(source).toContain('args[1] !== "diagnostic" && args[1] !== "scored"');
    expect(source).toContain("if (mode === \"scored\") await requireSuccessfulDiagnostic");
  });
});
