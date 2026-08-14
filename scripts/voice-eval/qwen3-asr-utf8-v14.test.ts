import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  QWEN_PARENT_DECODER_CONTRACT,
  QWEN_UTF8_ENVIRONMENT_CONTROLS,
  runBoundedUtf8JsonProcess,
} from "./qwen3-asr-process-v14.js";
import type { BoundedJsonProcessResult } from "./qwen3-asr-process.js";

const TEST_EXECUTABLE_SHA256 = "b".repeat(64);
const adapterPath = fileURLToPath(new URL("./qwen3-asr-adapter-v14.py", import.meta.url));
const baseAdapterPath = fileURLToPath(new URL("./qwen3-asr-adapter.py", import.meta.url));
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true, maxRetries: 2 })));
});

async function runFixture(options: {
  transcript?: string;
  script?: string;
  requireTranscript?: boolean;
  attemptId?: string;
} = {}): Promise<{ result: BoundedJsonProcessResult; diagnostic: string }> {
  const root = await mkdtemp(join(tmpdir(), "nitsyclaw-qwen-utf8-v14-test-"));
  roots.push(root);
  const evaluation = join(root, "evaluation");
  await mkdir(evaluation);
  await writeFile(join(evaluation, "synthetic.wav"), "fixture", "utf8");
  const transcript = options.transcript ?? "synthetic UTF-8 transcript";
  const script = options.script ??
    `process.stdout.write(JSON.stringify({status:'ok',cases:[{rawTranscript:${JSON.stringify(transcript)}}]}))`;
  const diagnosticPath = join(root, "diagnostic.json");
  const result = await runBoundedUtf8JsonProcess({
    executable: process.execPath,
    executableSha256: TEST_EXECUTABLE_SHA256,
    args: ["-e", script],
    sanitizedArgs: ["-e", "<synthetic-utf8-child-fixture>"],
    attemptId: options.attemptId ?? "utf8-fixture",
    diagnosticPath,
    timeoutMs: 5_000,
    sampleIntervalMs: 5,
    requireTranscript: options.requireTranscript ?? true,
    resourceSampler: async () => ({
      childRamBytes: 12_345,
      gpuMemoryBytes: 67_890,
      nonLoopbackTcpConnections: 0,
    }),
    cleanup: async () => {
      await rm(evaluation, { recursive: true, force: true });
      return { passed: true, evaluationDirectoryRemoved: true };
    },
  });
  await expect(access(evaluation)).rejects.toThrow();
  return { result, diagnostic: await readFile(diagnosticPath, "utf8") };
}

describe("Qwen3-ASR V1.4 strict UTF-8 transport", () => {
  it.each([
    ["Devanagari Hindi", "नमस्ते, कृपया सौर बैटरी की जाँच करें।"],
    ["Roman Hinglish", "Kal inverter ka output check karna, please."],
    ["mixed English and Devanagari", "Battery status ठीक है, next check tomorrow."],
    ["Indian names and solar products", "Nitesh Sharma ने Sungrow SH10RS और Tesla Powerwall 3 चुना।"],
    ["Unicode punctuation and currency", "Quote — ₹1,25,000; saving A$4,250.50 — ठीक?"],
    ["JSON controls", "Line one\n\"quoted\" \\ path\tcontrol\bvalue"],
    ["supplementary Unicode", "Solar check 😀 U+1F600 and 𐐷 U+10437"],
  ])("round-trips %s as native UTF-8 JSON", async (_label, transcript) => {
    const { result } = await runFixture({ transcript });
    expect(result.outcome).toBe("SUCCESS");
    expect(result.payload?.cases).toEqual([{ rawTranscript: transcript }]);
    expect(result.diagnostic.stdout.decodeError).toBe(false);
    expect(result.diagnostic.stdout.bytes).toBeGreaterThan(0);
    expect(result.diagnostic.stdout.storedBytes).toBe(result.diagnostic.stdout.bytes);
  });

  it("forces only the named UTF-8 controls and does not persist unrelated environment values", async () => {
    const prior = process.env.NITSYCLAW_UTF8_TEST_SECRET;
    const secret = ["not", "for", "diagnostic", "evidence"].join("-");
    process.env.NITSYCLAW_UTF8_TEST_SECRET = secret;
    try {
      const { result, diagnostic } = await runFixture({
        script: "process.stdout.write(JSON.stringify({status:'ok',cases:[{rawTranscript:[process.env.PYTHONUTF8,process.env.PYTHONIOENCODING].join('|')}]}))",
      });
      expect(result.payload?.cases).toEqual([{ rawTranscript: "1|utf-8" }]);
      expect(diagnostic).not.toContain("NITSYCLAW_UTF8_TEST_SECRET");
      expect(diagnostic).not.toContain(secret);
      expect(diagnostic).not.toContain("process.env");
    } finally {
      if (prior === undefined) delete process.env.NITSYCLAW_UTF8_TEST_SECRET;
      else process.env.NITSYCLAW_UTF8_TEST_SECRET = prior;
    }
  });

  it("fails closed on malformed UTF-8", async () => {
    const { result } = await runFixture({ script: "process.stdout.write(Buffer.from([255,254,253]))" });
    expect(result.outcome).toBe("MALFORMED_OUTPUT");
    expect(result.diagnostic.stdout.decodeError).toBe(true);
    expect(result.diagnostic.transcriptParse.status).toBe("MALFORMED");
  });

  it("fails closed on a truncated multibyte sequence", async () => {
    const script = "const a=Buffer.from('{\"status\":\"ok\",\"cases\":[{\"rawTranscript\":\"');const b=Buffer.from('₹');process.stdout.write(Buffer.concat([a,b.subarray(0,2)]))";
    const { result } = await runFixture({ script });
    expect(result.outcome).toBe("MALFORMED_OUTPUT");
    expect(result.diagnostic.stdout.decodeError).toBe(true);
    expect(result.diagnostic.transcriptParse.status).toBe("MALFORMED");
  });

  it("distinguishes zero-byte stdout from encoding failure", async () => {
    const { result } = await runFixture({ script: "process.exit(0)", requireTranscript: false });
    expect(result.outcome).toBe("ZERO_EXIT_EMPTY_OUTPUT");
    expect(result.diagnostic.stdout.bytes).toBe(0);
    expect(result.diagnostic.stdout.decodeError).toBe(false);
    expect(result.diagnostic.transcriptParse.status).toBe("EMPTY");
  });

  it("preserves valid Unicode stderr with a non-zero exit", async () => {
    const message = "त्रुटि: सौर जाँच विफल — ₹500";
    const { result } = await runFixture({
      script: `process.stderr.write(${JSON.stringify(message)});process.exit(23)`,
      requireTranscript: false,
    });
    expect(result.outcome).toBe("NONZERO_EXIT");
    expect(result.exitCode).toBe(23);
    expect(result.stderr).toBe(message);
    expect(result.diagnostic.stderr.decodeError).toBe(false);
  });

  it("restores the parent environment after the bounded child closes", async () => {
    const beforeUtf8 = process.env.PYTHONUTF8;
    const beforeIo = process.env.PYTHONIOENCODING;
    await runFixture();
    expect(process.env.PYTHONUTF8).toBe(beforeUtf8);
    expect(process.env.PYTHONIOENCODING).toBe(beforeIo);
  });

  it("freezes strict parent decoding and strict Python stream configuration", async () => {
    const adapter = await readFile(adapterPath, "utf8");
    const baseAdapter = await readFile(baseAdapterPath, "utf8");
    expect(QWEN_UTF8_ENVIRONMENT_CONTROLS).toEqual({ PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" });
    expect(QWEN_PARENT_DECODER_CONTRACT).toEqual({ encoding: "utf-8", fatal: true });
    expect(adapter).toContain('sys.stdout.reconfigure(encoding="utf-8", errors="strict")');
    expect(adapter).toContain('sys.stderr.reconfigure(encoding="utf-8", errors="strict")');
    expect(adapter).toContain('args.mode == "diagnostic" and len(args.case) != 1');
    expect(adapter).toContain('args.mode == "scored" and len(args.case) != 2');
    expect(baseAdapter).toContain("ensure_ascii=False");
    expect(adapter).not.toContain('device_map="auto"');
  });
});
