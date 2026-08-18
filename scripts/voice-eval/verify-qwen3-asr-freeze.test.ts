import { describe, expect, it } from "vitest";
import { verifyQwen3AsrSmokeFreeze } from "./verify-qwen3-asr-freeze.js";

describe("Qwen3-ASR smoke freeze", () => {
  it("locks the adapter, runner, runtime, model, and prior scorer aggregates", async () => {
    const frozen = await verifyQwen3AsrSmokeFreeze();
    expect(frozen.schemaVersion).toBe("NITSYCLAW-QWEN3-ASR-1.7B-SMOKE-FREEZE-V1.1");
    expect(frozen.files).toHaveLength(9);
    expect(frozen.model.revision).toBe("7278e1e70fe206f11671096ffdd38061171dd6e5");
    expect(frozen.runtime).toMatchObject({
      python: "3.12.10",
      qwenAsr: "0.0.6",
      torch: "2.9.1+cu128",
      transformers: "4.57.6",
      dtype: "bfloat16",
      device: "cuda:0",
      devicePolicy: "fixed-cuda-0",
      maxInferenceBatchSize: 1,
      maxNewTokens: 128,
    });
    expect(frozen.priorFreeze).toEqual({
      v2AggregateSha256: "d169f8584a158af92463bf84ad7afa257d2daeb5d2ed13d4df3b585e28115d7b",
      v21AggregateSha256: "fba510500f928675905d67e838caecd9b1075d708c96938d5249fc8d873820a5",
    });
    expect(frozen.diagnosticPolicy).toEqual({
      processSchema: "NITSYCLAW-QWEN3-ASR-PROCESS-DIAGNOSTIC-V1.1",
      adapterSchema: "NITSYCLAW-QWEN3-ASR-ADAPTER-V1.1",
      diagnosticCases: 1,
      scoredCases: 2,
      oneNewScoredRunMaximum: true,
      scoredRunAuthorized: false,
      atomicNoOverwrite: true,
      offlineEnvironmentPolicy: "OFFLINE_ALLOWLIST_V1",
    });
  });
});
