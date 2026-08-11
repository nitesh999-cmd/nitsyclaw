import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { verifyQwen3AsrV14Freeze } from "./verify-qwen3-asr-v14-freeze.js";

const adapterPath = fileURLToPath(new URL("./qwen3-asr-adapter-v14.py", import.meta.url));
const runnerPath = fileURLToPath(new URL("./run-qwen3-asr-v14-hinglish-diagnostic.ts", import.meta.url));
const processPath = fileURLToPath(new URL("./qwen3-asr-process-v14.ts", import.meta.url));

describe("Qwen3-ASR V1.4 UTF-8 transport re-freeze", () => {
  it("retains one diagnostic case and exactly two scored cases", async () => {
    const source = await readFile(adapterPath, "utf8");
    expect(source).toContain('args.mode == "diagnostic" and len(args.case) != 1');
    expect(source).toContain('args.mode == "scored" and len(args.case) != 2');
    expect(source).toContain('raise ValueError("diagnostic mode requires exactly one case")');
    expect(source).toContain('raise ValueError("scored mode requires exactly two cases")');
    expect(source).not.toContain('device_map="auto"');
  });

  it("forces and restores only the two approved UTF-8 environment controls", async () => {
    const source = await readFile(processPath, "utf8");
    expect(source).toContain('PYTHONUTF8: "1" as const');
    expect(source).toContain('PYTHONIOENCODING: "utf-8" as const');
    expect(source).toContain('restoreEnvironment("PYTHONUTF8"');
    expect(source).toContain('restoreEnvironment("PYTHONIOENCODING"');
    expect(source).not.toContain("JSON.stringify(process.env)");
  });

  it("keeps the V1.4 runner single-case, no-retry, diagnostic-only and scorer-free", async () => {
    const source = await readFile(runnerPath, "utf8");
    expect(source).toContain('const CASE_ID = "hinglish-business"');
    expect(source).toContain("process.argv.length !== 2");
    expect(source).toContain('"--case", `${CASE_ID}=${wavPath}`');
    expect(source).toContain('"--mode", "diagnostic"');
    expect(source).toContain("scorerExecutionAuthorized: false");
    expect(source).toContain("retryAuthorized: false");
    expect(source).toContain("runBoundedUtf8JsonProcess");
    expect(source).toContain("exactRawBytesRetained");
    expect(source).not.toContain("scoreQwen");
  });

  it("verifies the immutable V1.4 transport and evidence contract", async () => {
    const frozen = await verifyQwen3AsrV14Freeze();
    expect(frozen.transport.childEnvironment).toEqual({ PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" });
    expect(frozen.transport.parentDecoder).toEqual({ encoding: "utf-8", fatal: true });
    expect(frozen.transport.jsonEnsureAscii).toBe(false);
    expect(frozen.policy.diagnosticCases).toBe(1);
    expect(frozen.policy.scoredCases).toBe(2);
    expect(frozen.policy.scorerExecutionAuthorized).toBe(false);
    expect(frozen.policy.retryAuthorized).toBe(false);
  });
});
