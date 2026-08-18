import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const runnerPath = fileURLToPath(new URL("./run-qwen3-asr-v12-hinglish-diagnostic.ts", import.meta.url));
const adapterPath = fileURLToPath(new URL("./qwen3-asr-adapter.py", import.meta.url));

describe("Qwen3-ASR V1.2 single Hinglish causal diagnostic", () => {
  it("permits only the frozen synthetic Hinglish case and no scored path", async () => {
    const source = await readFile(runnerPath, "utf8");
    expect(source).toContain('const CASE_ID = "hinglish-business"');
    expect(source).toContain('const EXPECTED_AUDIO_SHA256 = "c46218063f37892bdec79afe09c9353cec2396bafa9ffba527ba33951949c01c"');
    expect(source).toContain("const EXPECTED_AUDIO_BYTES = 234_818");
    expect(source).toContain('process.argv.length !== 2');
    expect(source).toContain('scorerExecutionAuthorized: false');
    expect(source).not.toContain("scoreQwen");
    expect(source).not.toContain('device_map="auto"');
  });

  it("freezes durable preflight evidence and re-verifies it before process submission", async () => {
    const source = await readFile(runnerPath, "utf8");
    const preflightWrite = source.indexOf("await writeQwenDiagnosticAtomically(preflightPath, preflight)");
    const reverify = source.indexOf('persistedPreflight.phase !== "FROZEN_BEFORE_INFERENCE"');
    const submission = source.indexOf("processResult = await runBoundedJsonProcess");
    expect(preflightWrite).toBeGreaterThan(0);
    expect(reverify).toBeGreaterThan(preflightWrite);
    expect(submission).toBeGreaterThan(reverify);
    expect(source).toContain("Qwen V1.2 preflight evidence already exists; repeat execution is blocked.");
    expect(source).toContain("Qwen V1.2 process evidence already exists; repeat execution is blocked.");
  });

  it("submits one case with unchanged V1.1 telemetry, fixed cuda and offline monitoring", async () => {
    const source = await readFile(runnerPath, "utf8");
    expect(source).toContain("runBoundedJsonProcess");
    expect(source).toContain('frozenQwen.runtime.device !== "cuda:0"');
    expect(source).toContain('"--case", `${CASE_ID}=${wavPath}`');
    expect(source).toContain('"--mode", "diagnostic"');
    expect(source).toContain('environmentPolicy: "OFFLINE_ALLOWLIST_V1"');
    expect(source).toContain("exactPidNonLoopbackMonitoring: true");
    expect(source).toContain("nonLoopbackTcpConnectionsObserved");
  });

  it("records the proven unchanged-adapter contract conflict before model loading", async () => {
    const source = await readFile(adapterPath, "utf8");
    const twoCaseGuard = source.indexOf('if len(args.case) != 2:');
    const diagnosticSelection = source.indexOf('selected_cases = cases[:1] if args.mode == "diagnostic" else cases');
    const torchImport = source.indexOf("import torch as imported_torch");
    expect(twoCaseGuard).toBeGreaterThan(0);
    expect(diagnosticSelection).toBeGreaterThan(twoCaseGuard);
    expect(torchImport).toBeGreaterThan(diagnosticSelection);
    expect(source).toContain('raise ValueError("the bounded smoke requires exactly two cases")');
  });
});
