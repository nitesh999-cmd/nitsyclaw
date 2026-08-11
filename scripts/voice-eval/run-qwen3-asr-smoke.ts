import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { lstat, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalSapiSpeechSynthesizer } from "../../apps/bot/src/local-speech-synthesizer.js";
import type { VoiceLanguage } from "@nitsyclaw/shared/voice";
import { auditHeldOutCorpus } from "./scoring-v2.1.js";
import { getVoiceSmokeV2Manifest } from "./scoring-v2.js";
import { runBoundedJsonProcess, sha256Executable, type BoundedJsonProcessResult } from "./qwen3-asr-process.js";
import { scoreQwenSmokeV21 } from "./qwen3-asr-v21-score.js";
import { verifyQwen3AsrSmokeFreeze } from "./verify-qwen3-asr-freeze.js";
import { verifyVoiceSmokeV2Freeze } from "./verify-v2-freeze.js";
import { verifyVoiceSmokeV21Freeze } from "./verify-v2.1-freeze.js";

const MODEL_REVISION = "7278e1e70fe206f11671096ffdd38061171dd6e5";
const MODEL_FILES = 12;
const MODEL_BYTES = 4_703_114_308;
const MODEL_WEIGHT_HASHES = {
  "model-00001-of-00002.safetensors": "a4cd1f1a04d90b757dc7f7dd26254e69a013b19e80efe590a83c6a3bde8608d6",
  "model-00002-of-00002.safetensors": "6e0b9d9e09e2e0238e7ef3cc8a484ab387e91b90f1900bedf88bc92d7929ccfc",
} as const;
const PROCESS_TIMEOUT_MS = 600_000;
const directory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(directory, "..", "..");
const DEVICE_POLICY = "fixed-cuda-0" as const;

type RunMode = "diagnostic" | "scored";

type AdapterCase = {
  caseId: string;
  rawTranscript: string;
  modelLanguage: string;
  providerConfidence: null;
  latencyMs: number;
};

type AdapterPayload = {
  schemaVersion: "NITSYCLAW-QWEN3-ASR-ADAPTER-V1.1";
  status: "ok" | "error";
  mode?: RunMode;
  modelRevision?: string;
  cases?: AdapterCase[];
  resources?: Record<string, unknown>;
  cleanup: { cudaAllocatedBytes: number; cudaReservedBytes: number };
  networkPolicy: Record<string, unknown>;
  confidenceTelemetry: "unavailable";
  providerConfidence: null;
  error?: { kind?: string; class?: string };
  [key: string]: unknown;
};

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", resolvePromise);
  });
  return hash.digest("hex");
}

async function reviewedFile(path: string, expectedName: string): Promise<string> {
  if (!path || !isAbsolute(path) || basename(path).toLowerCase() !== expectedName.toLowerCase()) {
    throw new Error(`${expectedName} is not configured as an absolute reviewed path.`);
  }
  const resolved = await realpath(path);
  if (basename(resolved).toLowerCase() !== expectedName.toLowerCase() || !(await lstat(resolved)).isFile()) {
    throw new Error(`${expectedName} did not resolve to a reviewed local file.`);
  }
  return resolved;
}

async function assertPrivateTempDir(path: string): Promise<void> {
  const actual = await realpath(path);
  const base = await realpath(tmpdir());
  const child = relative(base, actual);
  if (!child || child.startsWith("..") || isAbsolute(child) || !(await lstat(actual)).isDirectory()) {
    throw new Error("The Qwen evaluation directory escaped its private temp root.");
  }
}

async function currentTempArtifacts(): Promise<string[]> {
  return (await readdir(tmpdir()))
    .filter((name) => name.startsWith("nitsyclaw-voice-") || name.startsWith("nitsyclaw-tts-"))
    .sort();
}

async function verifyModel(modelPath: string): Promise<Record<string, string>> {
  const files = (await readdir(modelPath, { withFileTypes: true })).filter((entry) => entry.isFile());
  if (files.length !== MODEL_FILES) throw new Error("Qwen model file count differs from the official manifest.");
  let bytes = 0;
  for (const entry of files) bytes += (await stat(join(modelPath, entry.name))).size;
  if (bytes !== MODEL_BYTES) throw new Error("Qwen model size differs from the official manifest.");
  const hashes: Record<string, string> = {};
  for (const [name, expected] of Object.entries(MODEL_WEIGHT_HASHES)) {
    const actual = await sha256File(join(modelPath, name));
    if (actual !== expected) throw new Error(`Qwen model integrity failed for ${name}.`);
    hashes[name] = actual;
  }
  return hashes;
}

function parseAdapterPayload(value: Record<string, unknown>, expectedCaseIds: string[], mode: RunMode): AdapterPayload {
  const candidate = value as Partial<AdapterPayload>;
  if (candidate.schemaVersion !== "NITSYCLAW-QWEN3-ASR-ADAPTER-V1.1" ||
      (candidate.status !== "ok" && candidate.status !== "error") ||
      candidate.confidenceTelemetry !== "unavailable" || candidate.providerConfidence !== null ||
      !candidate.cleanup || typeof candidate.cleanup.cudaAllocatedBytes !== "number" ||
      typeof candidate.cleanup.cudaReservedBytes !== "number" || !candidate.networkPolicy) {
    throw new Error("Qwen adapter returned an invalid result schema.");
  }
  if (candidate.status === "ok") {
    if (candidate.mode !== mode || candidate.modelRevision !== MODEL_REVISION || !Array.isArray(candidate.cases) ||
        candidate.cases.length !== expectedCaseIds.length) {
      throw new Error("Qwen adapter returned an invalid successful result.");
    }
    const caseIds = candidate.cases.map((item) => item.caseId);
    if (JSON.stringify(caseIds) !== JSON.stringify(expectedCaseIds) || new Set(caseIds).size !== caseIds.length) {
      throw new Error("Qwen adapter case correlation failed.");
    }
    for (const item of candidate.cases) {
      if (typeof item.rawTranscript !== "string" || !item.rawTranscript ||
          typeof item.modelLanguage !== "string" || item.providerConfidence !== null ||
          typeof item.latencyMs !== "number" || !Number.isFinite(item.latencyMs)) {
        throw new Error("Qwen adapter returned an invalid case result.");
      }
    }
  }
  return candidate as AdapterPayload;
}

function requestedMode(): RunMode {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--mode" || (args[1] !== "diagnostic" && args[1] !== "scored")) {
    throw new Error("Qwen V1.1 runner requires exactly --mode diagnostic or --mode scored.");
  }
  return args[1];
}

async function requireSuccessfulDiagnostic(path: string): Promise<void> {
  const value = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  const cleanup = value.cleanup as Record<string, unknown> | undefined;
  if (value.schemaVersion !== "NITSYCLAW-QWEN3-ASR-PROCESS-DIAGNOSTIC-V1.1" || value.phase !== "FINAL" ||
      value.outcome !== "SUCCESS" || value.nonLoopbackTcpConnectionsObserved !== 0 || cleanup?.passed !== true) {
    throw new Error("Scored Qwen smoke is blocked until the frozen V1.1 diagnostic succeeds offline with cleanup.");
  }
}

async function main(): Promise<void> {
  const mode = requestedMode();
  const frozenV2 = await verifyVoiceSmokeV2Freeze();
  const frozenV21 = await verifyVoiceSmokeV21Freeze();
  const frozenQwen = await verifyQwen3AsrSmokeFreeze();
  if (mode === "scored" && !frozenQwen.diagnosticPolicy.scoredRunAuthorized) {
    throw new Error("Scored Qwen smoke is frozen off because causal inference failure was not established.");
  }
  const v21Audit = auditHeldOutCorpus();
  const manifest = getVoiceSmokeV2Manifest();
  const localAppData = process.env.LOCALAPPDATA ?? "";
  if (!isAbsolute(localAppData)) throw new Error("LOCALAPPDATA is unavailable.");
  const python = await reviewedFile(
    join(repositoryRoot, ".qwen3-asr", "venv", "Scripts", "python.exe"),
    "python.exe",
  );
  const adapter = await reviewedFile(join(directory, "qwen3-asr-adapter.py"), "qwen3-asr-adapter.py");
  const ffmpeg = await reviewedFile(
    process.env.NITSYCLAW_FFMPEG_PATH?.trim() || join(localAppData, "Microsoft", "WinGet", "Links", "ffmpeg.exe"),
    "ffmpeg.exe",
  );
  const modelPath = join(
    localAppData,
    "NitsyClaw", "models", "Qwen3-ASR-1.7B", MODEL_REVISION,
  );
  const modelWeightSha256 = await verifyModel(modelPath);
  const pythonSha256 = await sha256Executable(python);
  const diagnosticPath = join(
    repositoryRoot,
    "docs",
    `qwen3-asr-v11-${DEVICE_POLICY}-${mode}-process-2026-08-11.json`,
  );
  const prerequisiteDiagnosticPath = join(
    repositoryRoot,
    "docs",
    `qwen3-asr-v11-${DEVICE_POLICY}-diagnostic-process-2026-08-11.json`,
  );
  if (mode === "scored") await requireSuccessfulDiagnostic(prerequisiteDiagnosticPath);
  const before = await currentTempArtifacts();
  const evaluationDir = await mkdtemp(join(tmpdir(), "nitsyclaw-voice-qwen3-asr-"));
  await assertPrivateTempDir(evaluationDir);
  const audioCorpus: Array<{ caseId: string; wavPath: string; sha256: string; size: number }> = [];
  let adapterPayload: AdapterPayload | undefined;
  let processResult: BoundedJsonProcessResult | undefined;

  try {
    const synthesizer = new LocalSapiSpeechSynthesizer();
    for (const testCase of manifest.cases) {
      const generated = await synthesizer.synthesize({
        text: testCase.reference,
        language: testCase.expectedLanguage as VoiceLanguage,
        correlationId: `qwen3-asr-${testCase.id}`,
      });
      const oggPath = join(evaluationDir, `${testCase.id}.ogg`);
      const wavPath = join(evaluationDir, `${testCase.id}.wav`);
      await writeFile(oggPath, generated.audio, { flag: "wx" });
      const ffmpegResult = await new Promise<{ exitCode: number | null }>((resolvePromise, reject) => {
        // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- reviewed ffmpeg path, fixed arguments, no shell or network protocols.
        const child = spawn(ffmpeg, [
          "-v", "error", "-nostdin", "-protocol_whitelist", "file",
          "-max_alloc", String(64 * 1024 * 1024), "-threads", "1",
          "-i", oggPath, "-map", "0:a:0", "-vn", "-sn", "-dn",
          "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wavPath,
        ], { shell: false, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
        const stderr: Buffer[] = [];
        let bytes = 0;
        child.stderr.on("data", (chunk: Buffer) => {
          bytes += chunk.byteLength;
          if (bytes <= 64 * 1024) stderr.push(Buffer.from(chunk));
          else child.kill();
        });
        const timer = setTimeout(() => child.kill(), 30_000);
        child.once("error", () => reject(new Error("ffmpeg could not start.")));
        child.once("close", (exitCode) => {
          clearTimeout(timer);
          if (exitCode !== 0) reject(new Error(`ffmpeg failed with code ${exitCode ?? "unknown"}: ${Buffer.concat(stderr).toString("utf8").trim()}`));
          else resolvePromise({ exitCode });
        });
      });
      if (ffmpegResult.exitCode !== 0) throw new Error("ffmpeg conversion failed.");
      const wav = await readFile(wavPath);
      audioCorpus.push({
        caseId: testCase.id,
        wavPath,
        sha256: createHash("sha256").update(wav).digest("hex"),
        size: wav.byteLength,
      });
    }
    const childArgs = [
      "-I", adapter,
      "--model-path", modelPath,
      "--audio-root", evaluationDir,
      ...audioCorpus.flatMap((audio) => ["--case", `${audio.caseId}=${audio.wavPath}`]),
      "--max-new-tokens", "128",
      "--mode", mode,
    ];
    const sanitizedArgs = [
      "-I", "<reviewed-qwen3-asr-adapter.py>",
      "--model-path", `<pinned-model-revision:${MODEL_REVISION}>`,
      "--audio-root", "<private-synthetic-audio-root>",
      ...audioCorpus.flatMap((audio) => ["--case", `${audio.caseId}=<private-synthetic-wav>`]),
      "--max-new-tokens", "128",
      "--mode", mode,
    ];
    const expectedCaseIds = audioCorpus.map((item) => item.caseId).slice(0, mode === "diagnostic" ? 1 : 2);
    processResult = await runBoundedJsonProcess({
      executable: python,
      executableSha256: pythonSha256,
      args: childArgs,
      sanitizedArgs,
      attemptId: `qwen3-asr-v11-${DEVICE_POLICY}-${mode}`,
      diagnosticPath,
      timeoutMs: PROCESS_TIMEOUT_MS,
      requireTranscript: true,
      validatePayload: (payload) => {
        try {
          parseAdapterPayload(payload, expectedCaseIds, mode);
          return { valid: true };
        } catch (error) {
          return { valid: false, error: error instanceof Error ? error.message : "Qwen adapter schema validation failed." };
        }
      },
      redactions: [repositoryRoot, localAppData, modelPath, evaluationDir, python, adapter, ...audioCorpus.map((item) => item.wavPath)],
      cleanup: async () => {
        await rm(evaluationDir, { recursive: true, force: true, maxRetries: 2 });
        const after = await currentTempArtifacts();
        return {
          passed: JSON.stringify(before) === JSON.stringify(after),
          privateEvaluationDirectoryRemoved: true,
          tempArtifactSetRestored: JSON.stringify(before) === JSON.stringify(after),
        };
      },
    });
    if (processResult.payload) {
      adapterPayload = parseAdapterPayload(processResult.payload, expectedCaseIds, mode);
    }
  } finally {
    if (!processResult) await rm(evaluationDir, { recursive: true, force: true, maxRetries: 2 });
  }

  const after = await currentTempArtifacts();
  const cleanupPassed = JSON.stringify(before) === JSON.stringify(after) &&
    processResult?.diagnostic.cleanup.passed === true &&
    adapterPayload?.cleanup.cudaAllocatedBytes === 0 && adapterPayload.cleanup.cudaReservedBytes === 0;
  const scores = mode === "scored" && adapterPayload?.status === "ok"
    ? adapterPayload.cases?.map((item) => ({
      modelLanguage: item.modelLanguage,
      ...scoreQwenSmokeV21({
        caseId: item.caseId,
        rawTranscript: item.rawTranscript,
        providerConfidence: null,
        latencyMs: item.latencyMs,
      }),
    })) ?? []
    : [];
  const diagnosticSucceeded = mode === "diagnostic" && processResult?.outcome === "SUCCESS" &&
    adapterPayload?.status === "ok" && adapterPayload.cases?.length === 1 && cleanupPassed;
  const scoredPassed = mode === "scored" && processResult?.outcome === "SUCCESS" &&
    adapterPayload?.status === "ok" && processResult.exitCode === 0 && scores.length === manifest.cases.length &&
    scores.every((score) => score.passed) && scores.every((score) => score.frozenV21.confirmationRequired) &&
    v21Audit.passed && cleanupPassed;
  const passed = diagnosticSucceeded || scoredPassed;
  console.log(JSON.stringify({
    schemaVersion: "NITSYCLAW-QWEN3-ASR-1.7B-SMOKE-V1.1",
    mode,
    devicePolicy: DEVICE_POLICY,
    candidate: "Qwen/Qwen3-ASR-1.7B",
    modelRevision: MODEL_REVISION,
    frozenQwenAggregateSha256: frozenQwen.aggregateSha256,
    frozenV2AggregateSha256: frozenV2.aggregateSha256,
    frozenV21AggregateSha256: frozenV21.aggregateSha256,
    modelWeightSha256,
    offlineIsolation: {
      kernelFirewallRule: false,
      pythonSocketAccessDeniedBeforeImports: true,
      offlineEnvironmentForced: true,
      nonLoopbackTcpConnectionsObserved: processResult?.diagnostic.nonLoopbackTcpConnectionsObserved ?? null,
    },
    audioCorpus: audioCorpus.map(({ caseId, sha256, size }) => ({ caseId, sha256, size })),
    adapterProcess: processResult ? {
      outcome: processResult.outcome,
      exitCode: processResult.exitCode,
      elapsedMs: processResult.elapsedMs,
      stderrSha256: createHash("sha256").update(processResult.stderr).digest("hex"),
      diagnosticPath: relative(repositoryRoot, processResult.diagnosticPath).replace(/\\/gu, "/"),
      diagnosticSha256: await sha256File(processResult.diagnosticPath),
      lifecycle: processResult.diagnostic.lifecycle,
      peakChildRamBytes: processResult.diagnostic.peakChildRamBytes,
      peakGpuMemoryBytes: processResult.diagnostic.peakGpuMemoryBytes,
      outputTruncated: processResult.diagnostic.outputTruncated,
    } : null,
    adapter: adapterPayload,
    frozenV2Scores: scores,
    frozenV21Audit: v21Audit,
    cleanupPassed,
    externalActionAllowed: false,
    confidenceLimitation: "Qwen3-ASR 0.0.6 exposes no calibrated confidence in this path; null is preserved and every external action remains owner-confirmation-gated.",
    passed,
  }, null, 2));
  if (!passed) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error("Qwen3-ASR smoke stopped without a verdict.", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
