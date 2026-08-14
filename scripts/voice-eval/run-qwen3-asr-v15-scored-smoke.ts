import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { freemem, tmpdir, totalmem } from "node:os";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalSapiSpeechSynthesizer } from "../../apps/bot/src/local-speech-synthesizer.js";
import type { VoiceLanguage } from "@nitsyclaw/shared/voice";
import {
  sha256Executable,
  writeQwenDiagnosticAtomically,
  type BoundedJsonProcessResult,
} from "./qwen3-asr-process.js";
import {
  QWEN_PARENT_DECODER_CONTRACT,
  QWEN_UTF8_ENVIRONMENT_CONTROLS,
  runBoundedUtf8JsonProcess,
} from "./qwen3-asr-process-v14.js";
import { scoreQwenSmokeV21 } from "./qwen3-asr-v21-score.js";
import { getVoiceSmokeV2Manifest } from "./scoring-v2.js";
import { verifyQwen3AsrV15Freeze, type Qwen3AsrV15Freeze } from "./verify-qwen3-asr-v15-freeze.js";
import { verifyVoiceSmokeV21Freeze } from "./verify-v2.1-freeze.js";

const MODEL_REVISION = "7278e1e70fe206f11671096ffdd38061171dd6e5";
const CASE_IDS = ["english-solar-au", "hinglish-business"] as const;
const PROCESS_TIMEOUT_MS = 600_000;
const ATTEMPT_ID = "qwen3-asr-v15-fixed-cuda-0-scored-two-case";
const directory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(directory, "..", "..");
const preflightPath = join(repositoryRoot, "docs", "qwen3-asr-v15-scored-two-case-preflight-2026-08-11.json");
const processPath = join(repositoryRoot, "docs", "qwen3-asr-v15-fixed-cuda-0-scored-process-2026-08-11.json");
const transportPath = join(repositoryRoot, "docs", "qwen3-asr-v15-scored-utf8-transport-2026-08-11.json");
const resultPath = join(repositoryRoot, "docs", "qwen3-asr-v15-scored-result-2026-08-11.json");
const staticFreezePath = join(directory, "qwen3-asr-v15-scored.freeze.json");

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
  mode?: "scored";
  modelRevision?: string;
  modelWeightSha256?: Record<string, string>;
  cases?: AdapterCase[];
  resources?: Record<string, unknown>;
  cleanup: { cudaAllocatedBytes: number; cudaReservedBytes: number };
  networkPolicy: Record<string, unknown>;
  confidenceTelemetry: "unavailable";
  providerConfidence: null;
  [key: string]: unknown;
};

type FrozenCase = { id: string; reference: string; expectedLanguage: VoiceLanguage };

function sha256Bytes(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Json(value: unknown): string {
  return sha256Bytes(JSON.stringify(value));
}

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

function execFileText(executable: string, args: string[], timeoutMs = 10_000): Promise<string | null> {
  return new Promise((resolvePromise) => {
    // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- fixed reviewed local executable, fixed read-only arguments, no shell.
    execFile(executable, args, {
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 512 * 1024,
      encoding: "utf8",
      env: {
        ...process.env,
        HF_HUB_OFFLINE: "1",
        TRANSFORMERS_OFFLINE: "1",
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
      },
    }, (error, stdout) => resolvePromise(error ? null : stdout));
  });
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
    throw new Error("The Qwen V1.5 evaluation directory escaped its private temp root.");
  }
}

async function currentTempArtifacts(): Promise<string[]> {
  return (await readdir(tmpdir()))
    .filter((name) => name.startsWith("nitsyclaw-voice-") || name.startsWith("nitsyclaw-tts-"))
    .sort();
}

async function assertNoEvidenceExists(paths: readonly string[]): Promise<void> {
  for (const path of paths) {
    await access(path).then(
      () => { throw new Error(`Qwen V1.5 evidence already exists; repeat execution is blocked: ${basename(path)}`); },
      (error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; },
    );
  }
}

async function assertCommittedTrackedState(): Promise<string> {
  const [head, unstaged, staged] = await Promise.all([
    execFileText("git.exe", ["rev-parse", "HEAD"]),
    execFileText("git.exe", ["diff", "--quiet"]).then((value) => value === "" ? "clean" : value),
    execFileText("git.exe", ["diff", "--cached", "--quiet"]).then((value) => value === "" ? "clean" : value),
  ]);
  if (!head?.trim() || unstaged !== "clean" || staged !== "clean") {
    throw new Error("Tracked worktree must be committed and clean before the one-shot child is submitted.");
  }
  return head.trim();
}

async function verifyModel(modelPath: string, frozen: Qwen3AsrV15Freeze): Promise<void> {
  const files = (await readdir(modelPath, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .sort((left, right) => left.name.localeCompare(right.name));
  if (files.length !== frozen.model.files.length) throw new Error("Qwen model file count changed.");
  for (let index = 0; index < files.length; index += 1) {
    const entry = files[index]!;
    const expected = frozen.model.files[index]!;
    const filePath = join(modelPath, entry.name);
    const bytes = (await stat(filePath)).size;
    if (entry.name !== expected.name || bytes !== expected.bytes || await sha256File(filePath) !== expected.sha256) {
      throw new Error(`Qwen model integrity changed: ${entry.name}`);
    }
  }
}

async function verifyRuntime(python: string, ffmpeg: string, frozen: Qwen3AsrV15Freeze): Promise<void> {
  if (await sha256Executable(python) !== frozen.runtime.pythonExecutableSha256 ||
      await sha256File(ffmpeg) !== frozen.runtime.ffmpeg.sha256 || (await stat(ffmpeg)).size !== frozen.runtime.ffmpeg.bytes) {
    throw new Error("The isolated Python or FFmpeg binary changed.");
  }
  const source = "import json,platform,importlib.metadata as m;d={x.metadata['Name'].lower():x.version for x in m.distributions() if x.metadata['Name']};print(json.dumps({'python':platform.python_version(),'packages':dict(sorted(d.items()))},separators=(',',':'),sort_keys=True))";
  const output = await execFileText(python, ["-I", "-c", source]);
  if (!output) throw new Error("The isolated Python runtime inventory could not be read.");
  const actual = JSON.parse(output) as { python: string; packages: Record<string, string> };
  if (actual.python !== frozen.runtime.python || JSON.stringify(actual.packages) !== JSON.stringify(frozen.runtime.packages)) {
    throw new Error("The isolated Python dependency inventory changed.");
  }
}

async function convertToPcmWav(ffmpeg: string, input: string, output: string): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- reviewed FFmpeg path, fixed file-only arguments, no shell or network protocols.
    const child = spawn(ffmpeg, [
      "-v", "error", "-nostdin", "-protocol_whitelist", "file",
      "-max_alloc", String(64 * 1024 * 1024), "-threads", "1",
      "-i", input, "-map", "0:a:0", "-vn", "-sn", "-dn",
      "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", output,
    ], { shell: false, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderrBytes = 0;
    let stopped = false;
    const timer = setTimeout(() => { stopped = true; child.kill(); }, 30_000);
    timer.unref?.();
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > 64 * 1024) { stopped = true; child.kill(); }
    });
    child.once("error", () => { clearTimeout(timer); reject(new Error("FFmpeg could not start.")); });
    child.once("close", (exitCode) => {
      clearTimeout(timer);
      if (stopped || exitCode !== 0) reject(new Error("FFmpeg failed during frozen two-case fixture preparation."));
      else resolvePromise();
    });
  });
}

async function gpuSnapshot(): Promise<Record<string, unknown>> {
  const [gpu, processes] = await Promise.all([
    execFileText("nvidia-smi.exe", ["--query-gpu=name,driver_version,memory.total,memory.used,memory.free", "--format=csv,noheader,nounits"]),
    execFileText("nvidia-smi.exe", ["--query-compute-apps=pid,used_gpu_memory", "--format=csv,noheader,nounits"]),
  ]);
  return {
    available: gpu !== null,
    gpu: gpu?.trim() || null,
    computeProcesses: processes?.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean) ?? null,
  };
}

async function processCleanupEvidence(pid: number | null): Promise<Record<string, unknown>> {
  if (pid === null) return { exactPidAbsent: null, gpuComputeRowAbsent: null };
  const [task, gpu] = await Promise.all([
    execFileText("tasklist.exe", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]),
    execFileText("nvidia-smi.exe", ["--query-compute-apps=pid,used_gpu_memory", "--format=csv,noheader,nounits"]),
  ]);
  const exactPidAbsent = task !== null && /no tasks are running/iu.test(task);
  const gpuComputeRowAbsent = gpu !== null && !gpu.split(/\r?\n/u).some((line) => line.trim().split(",", 1)[0]?.trim() === String(pid));
  return { exactPidAbsent, gpuComputeRowAbsent };
}

export function parseScoredAdapterPayload(value: Record<string, unknown>): AdapterPayload {
  const candidate = value as Partial<AdapterPayload>;
  if (candidate.schemaVersion !== "NITSYCLAW-QWEN3-ASR-ADAPTER-V1.1" ||
      (candidate.status !== "ok" && candidate.status !== "error") ||
      candidate.confidenceTelemetry !== "unavailable" || candidate.providerConfidence !== null ||
      !candidate.cleanup || typeof candidate.cleanup.cudaAllocatedBytes !== "number" ||
      typeof candidate.cleanup.cudaReservedBytes !== "number" || !candidate.networkPolicy) {
    throw new Error("Qwen adapter returned an invalid frozen telemetry schema.");
  }
  if (candidate.status === "ok") {
    if (candidate.mode !== "scored" || candidate.modelRevision !== MODEL_REVISION ||
        !Array.isArray(candidate.cases) || candidate.cases.length !== 2) {
      throw new Error("Qwen adapter returned an invalid scored result.");
    }
    const ids = candidate.cases.map((item) => item.caseId);
    if (JSON.stringify(ids) !== JSON.stringify(CASE_IDS) || new Set(ids).size !== 2) {
      throw new Error("Qwen scored case order or correlation failed.");
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

async function main(): Promise<void> {
  if (process.argv.length !== 2) throw new Error("Qwen V1.5 scored runner accepts no runtime arguments.");
  await assertNoEvidenceExists([
    preflightPath, processPath, `${processPath}.running`, transportPath, resultPath,
  ]);
  const launchCommit = await assertCommittedTrackedState();
  const [frozen, frozenV21] = await Promise.all([verifyQwen3AsrV15Freeze(), verifyVoiceSmokeV21Freeze()]);
  const manifest = getVoiceSmokeV2Manifest();
  if (JSON.stringify(manifest.cases.map((item) => item.id)) !== JSON.stringify(CASE_IDS) ||
      JSON.stringify(manifest.thresholds) !== JSON.stringify(frozen.thresholds)) {
    throw new Error("The frozen case order or thresholds changed.");
  }

  const localAppData = process.env.LOCALAPPDATA ?? "";
  if (!isAbsolute(localAppData)) throw new Error("LOCALAPPDATA is unavailable.");
  const python = await reviewedFile(join(repositoryRoot, ".qwen3-asr", "venv", "Scripts", "python.exe"), "python.exe");
  const adapter = await reviewedFile(join(directory, "qwen3-asr-adapter-v14.py"), "qwen3-asr-adapter-v14.py");
  const ffmpeg = await reviewedFile(
    process.env.NITSYCLAW_FFMPEG_PATH?.trim() || join(localAppData, "Microsoft", "WinGet", "Links", "ffmpeg.exe"),
    "ffmpeg.exe",
  );
  const modelPath = await realpath(join(localAppData, "NitsyClaw", "models", "Qwen3-ASR-1.7B", MODEL_REVISION));
  if (basename(modelPath) !== MODEL_REVISION) throw new Error("The pinned model directory changed.");
  await Promise.all([verifyRuntime(python, ffmpeg, frozen), verifyModel(modelPath, frozen)]);

  const beforeArtifacts = await currentTempArtifacts();
  const evaluationDir = await mkdtemp(join(tmpdir(), "nitsyclaw-voice-qwen3-asr-v15-"));
  await assertPrivateTempDir(evaluationDir);
  const corpus: Array<{ caseId: string; wavPath: string; oggPath: string; sha256: string; bytes: number }> = [];
  let processResult: BoundedJsonProcessResult | undefined;

  try {
    const synthesizer = new LocalSapiSpeechSynthesizer();
    for (let index = 0; index < CASE_IDS.length; index += 1) {
      const caseId = CASE_IDS[index]!;
      const expected = frozen.cases[index]!;
      const testCase = manifest.cases[index] as FrozenCase | undefined;
      if (!testCase || testCase.id !== caseId || testCase.reference !== expected.expectedTranscript ||
          testCase.expectedLanguage !== expected.expectedLanguage || sha256Bytes(testCase.reference) !== expected.expectedTranscriptSha256) {
        throw new Error(`Frozen ground truth changed: ${caseId}`);
      }
      const generated = await synthesizer.synthesize({
        text: testCase.reference,
        language: testCase.expectedLanguage,
        correlationId: `qwen3-asr-v15-${caseId}`,
      });
      const oggPath = join(evaluationDir, `${caseId}.ogg`);
      const wavPath = join(evaluationDir, `${caseId}.wav`);
      await writeFile(oggPath, generated.audio, { flag: "wx" });
      await convertToPcmWav(ffmpeg, oggPath, wavPath);
      const sha256 = await sha256File(wavPath);
      const bytes = (await stat(wavPath)).size;
      if (sha256 !== expected.wavSha256 || bytes !== expected.wavBytes) {
        throw new Error(`Generated WAV is not byte-identical to the frozen fixture: ${caseId}`);
      }
      corpus.push({ caseId, wavPath, oggPath, sha256, bytes });
    }

    const invocation = frozen.invocation;
    const preflight = {
      schemaVersion: frozen.evidenceSchemas.preflight,
      phase: "FROZEN_BEFORE_INFERENCE",
      capturedAt: new Date().toISOString(),
      startingCommit: frozen.startingCommit,
      launchCommit,
      staticFreezeSha256: await sha256File(staticFreezePath),
      frozenV15AggregateSha256: frozen.aggregateSha256,
      parentV14AggregateSha256: frozen.parentV14AggregateSha256,
      frozenV2AggregateSha256: frozen.frozenV2AggregateSha256,
      frozenV21AggregateSha256: frozenV21.aggregateSha256,
      invocation,
      invocationSha256: sha256Json(invocation),
      fixtures: corpus.map(({ caseId, sha256, bytes }) => ({ caseId, sha256, bytes, synthetic: true })),
      expectedTranscripts: frozen.cases.map(({ caseId, expectedTranscriptSha256 }) => ({ caseId, sha256: expectedTranscriptSha256 })),
      model: frozen.model,
      runtime: frozen.runtime,
      thresholds: frozen.thresholds,
      baseline: {
        ram: { totalBytes: totalmem(), freeBytes: freemem(), parentRssBytes: process.memoryUsage().rss },
        gpu: await gpuSnapshot(),
        tempArtifacts: beforeArtifacts,
      },
      networkIsolation: {
        kernelFirewallRule: false,
        pythonSocketAccess: "denied-before-third-party-imports",
        offlineEnvironmentPolicy: "OFFLINE_ALLOWLIST_V1",
        exactPidNonLoopbackMonitoring: true,
      },
      evidenceSchemas: frozen.evidenceSchemas,
      policy: frozen.policy,
    };
    await writeQwenDiagnosticAtomically(preflightPath, preflight);
    const persisted = JSON.parse(await readFile(preflightPath, "utf8")) as typeof preflight;
    const reverified = await verifyQwen3AsrV15Freeze();
    if (persisted.phase !== "FROZEN_BEFORE_INFERENCE" || persisted.launchCommit !== launchCommit ||
        persisted.invocationSha256 !== sha256Json(frozen.invocation) ||
        persisted.frozenV15AggregateSha256 !== reverified.aggregateSha256 ||
        JSON.stringify(persisted.fixtures) !== JSON.stringify(corpus.map(({ caseId, sha256, bytes }) => ({ caseId, sha256, bytes, synthetic: true }))) ||
        persisted.policy.diagnosticChildAuthorized !== false || persisted.policy.retryAuthorized !== false) {
      throw new Error("The V1.5 freeze, invocation or fixtures changed before submission.");
    }

    const childArgs = [
      "-I", adapter,
      "--model-path", modelPath,
      "--audio-root", evaluationDir,
      ...corpus.flatMap((item) => ["--case", `${item.caseId}=${item.wavPath}`]),
      "--max-new-tokens", "128",
      "--mode", "scored",
    ];
    processResult = await runBoundedUtf8JsonProcess({
      executable: python,
      executableSha256: frozen.runtime.pythonExecutableSha256,
      args: childArgs,
      sanitizedArgs: frozen.invocation.arguments,
      attemptId: ATTEMPT_ID,
      diagnosticPath: processPath,
      timeoutMs: PROCESS_TIMEOUT_MS,
      requireTranscript: true,
      validatePayload: (payload) => {
        try { parseScoredAdapterPayload(payload); return { valid: true }; }
        catch (error) { return { valid: false, error: error instanceof Error ? error.message : "Qwen scored payload validation failed." }; }
      },
      redactions: [repositoryRoot, localAppData, modelPath, evaluationDir, python, adapter, ffmpeg, ...corpus.flatMap((item) => [item.wavPath, item.oggPath])],
      cleanup: async () => {
        await rm(evaluationDir, { recursive: true, force: true, maxRetries: 2 });
        const after = await currentTempArtifacts();
        const directoryRemoved = await stat(evaluationDir).then(() => false, () => true);
        return {
          passed: directoryRemoved && JSON.stringify(beforeArtifacts) === JSON.stringify(after),
          privateEvaluationDirectoryRemoved: directoryRemoved,
          tempArtifactSetRestored: JSON.stringify(beforeArtifacts) === JSON.stringify(after),
        };
      },
    });

    const rawStdout = Buffer.from(processResult.stdout, "utf8");
    const exactRawStdoutRetained = processResult.diagnostic.stdout.decodeError === false &&
      processResult.diagnostic.stdout.truncated === false && rawStdout.byteLength === processResult.diagnostic.stdout.bytes;
    const parsed = processResult.payload ? parseScoredAdapterPayload(processResult.payload) : null;
    const transportEvidence = {
      schemaVersion: frozen.evidenceSchemas.transport,
      attemptId: ATTEMPT_ID,
      modelChildCount: 1,
      retryCount: 0,
      environmentControls: QWEN_UTF8_ENVIRONMENT_CONTROLS,
      unrelatedEnvironmentValuesRecorded: false,
      parentDecoder: QWEN_PARENT_DECODER_CONTRACT,
      pythonStreams: { encoding: "utf-8", errors: "strict" },
      jsonEnsureAscii: false,
      stdout: {
        bytes: processResult.diagnostic.stdout.bytes,
        sha256: sha256Bytes(rawStdout),
        base64: rawStdout.toString("base64"),
        exactRawBytesRetained: exactRawStdoutRetained,
        strictUtf8Decode: processResult.diagnostic.stdout.decodeError ? "FAIL" : "PASS",
      },
      parsedJsonSha256: processResult.payload ? sha256Json(processResult.payload) : null,
      parsedPayload: processResult.payload,
      rawTranscripts: parsed?.status === "ok" ? parsed.cases?.map(({ caseId, rawTranscript }) => ({ caseId, rawTranscript })) : null,
      processOutcome: processResult.outcome,
      exitCode: processResult.exitCode,
    };
    await writeQwenDiagnosticAtomically(transportPath, transportEvidence);

    const postProcessCleanup = await processCleanupEvidence(processResult.diagnostic.processId);
    const scores = parsed?.status === "ok" && parsed.cases
      ? parsed.cases.map((item) => ({
        modelLanguage: item.modelLanguage,
        ...scoreQwenSmokeV21({
          caseId: item.caseId,
          rawTranscript: item.rawTranscript,
          providerConfidence: null,
          latencyMs: item.latencyMs,
        }),
      }))
      : [];
    const cleanupPassed = processResult.diagnostic.cleanup.passed === true &&
      postProcessCleanup.exactPidAbsent === true && postProcessCleanup.gpuComputeRowAbsent === true;
    const passed = processResult.outcome === "SUCCESS" && processResult.exitCode === 0 &&
      exactRawStdoutRetained && parsed?.status === "ok" && scores.length === 2 &&
      scores.every((score) => score.passed && score.frozenV21.safetyPassed && score.frozenV21.confirmationRequired) &&
      processResult.diagnostic.nonLoopbackTcpConnectionsObserved === 0 && cleanupPassed;
    const resultEvidence = {
      schemaVersion: frozen.evidenceSchemas.result,
      verdict: passed ? "PASS" : "FAIL",
      voiceRelease: "NO_GO",
      attemptId: ATTEMPT_ID,
      oneChildProof: { modelChildCount: 1, retryCount: 0, caseOrder: CASE_IDS, mode: "scored" },
      candidate: "Qwen/Qwen3-ASR-1.7B",
      modelRevision: MODEL_REVISION,
      frozenV15AggregateSha256: frozen.aggregateSha256,
      frozenV2AggregateSha256: frozen.frozenV2AggregateSha256,
      frozenV21AggregateSha256: frozen.frozenV21AggregateSha256,
      fixtures: corpus.map(({ caseId, sha256, bytes }) => ({ caseId, sha256, bytes })),
      transportEvidenceSha256: await sha256File(transportPath),
      processEvidenceSha256: await sha256File(processPath),
      process: {
        outcome: processResult.outcome,
        exitCode: processResult.exitCode,
        elapsedMs: processResult.elapsedMs,
        lifecycle: processResult.diagnostic.lifecycle,
        stdout: processResult.diagnostic.stdout,
        stderr: processResult.diagnostic.stderr,
        transcriptParse: processResult.diagnostic.transcriptParse,
        peakChildRamBytes: processResult.diagnostic.peakChildRamBytes,
        peakGpuMemoryBytes: processResult.diagnostic.peakGpuMemoryBytes,
        resourceSamples: processResult.diagnostic.resourceSamples,
        nonLoopbackTcpConnectionsObserved: processResult.diagnostic.nonLoopbackTcpConnectionsObserved,
      },
      adapter: parsed,
      scores,
      postProcessCleanup,
      cleanupPassed,
      externalActionAllowed: false,
      confidenceLimitation: "Qwen3-ASR 0.0.6 exposes no calibrated confidence in this path; null is preserved and every external action remains explicit-owner-confirmation-gated.",
      passed,
    };
    await writeQwenDiagnosticAtomically(resultPath, resultEvidence);
    console.log(JSON.stringify({
      schemaVersion: "NITSYCLAW-QWEN3-ASR-V1.5-SCORED-SUMMARY-1",
      verdict: resultEvidence.verdict,
      resultPath: relative(repositoryRoot, resultPath).replace(/\\/gu, "/"),
      processPath: relative(repositoryRoot, processPath).replace(/\\/gu, "/"),
      transportPath: relative(repositoryRoot, transportPath).replace(/\\/gu, "/"),
      oneChildProof: resultEvidence.oneChildProof,
      passed,
    }, null, 2));
    if (!passed) process.exitCode = 1;
  } finally {
    if (!processResult) await rm(evaluationDir, { recursive: true, force: true, maxRetries: 2 });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main().catch((error: unknown) => {
    console.error("Qwen V1.5 scored smoke stopped without a verdict.", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  });
}
