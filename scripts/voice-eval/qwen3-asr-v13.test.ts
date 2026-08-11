import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { verifyQwen3AsrV13Freeze } from "./verify-qwen3-asr-v13-freeze.js";

const adapterPath = fileURLToPath(new URL("./qwen3-asr-adapter-v13.py", import.meta.url));
const runnerPath = fileURLToPath(new URL("./run-qwen3-asr-v13-hinglish-diagnostic.ts", import.meta.url));

describe("Qwen3-ASR V1.3 single-case diagnostic re-freeze", () => {
  it("permits one diagnostic case while retaining two scored cases", async () => {
    const source = await readFile(adapterPath, "utf8");
    expect(source).toContain('args.mode == "diagnostic" and len(args.case) != 1');
    expect(source).toContain('args.mode == "scored" and len(args.case) != 2');
    expect(source).toContain('raise ValueError("diagnostic mode requires exactly one case")');
    expect(source).toContain('raise ValueError("scored mode requires exactly two cases")');
    expect(source).toContain("BASE_ADAPTER_SHA256");
    expect(source).not.toContain('device_map="auto"');
  });

  it("keeps the V1.3 runner single-case, no-retry, diagnostic-only and offline", async () => {
    const source = await readFile(runnerPath, "utf8");
    expect(source).toContain('const CASE_ID = "hinglish-business"');
    expect(source).toContain('process.argv.length !== 2');
    expect(source).toContain('"--case", `${CASE_ID}=${wavPath}`');
    expect(source).toContain('"--mode", "diagnostic"');
    expect(source).toContain("scorerExecutionAuthorized: false");
    expect(source).toContain("retryAuthorized: false");
    expect(source).not.toContain("scoreQwen");
  });

  it("verifies the immutable V1.3 aggregate", async () => {
    const frozen = await verifyQwen3AsrV13Freeze();
    expect(frozen.policy.diagnosticCases).toBe(1);
    expect(frozen.policy.scoredCases).toBe(2);
    expect(frozen.policy.scorerExecutionAuthorized).toBe(false);
    expect(frozen.policy.retryAuthorized).toBe(false);
  });
});
