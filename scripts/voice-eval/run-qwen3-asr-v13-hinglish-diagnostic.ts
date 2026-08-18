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
  runBoundedJsonProcess,
  sha256Executable,
  writeQwenDiagnosticAtomically,
  type BoundedJsonProcessResult,
} from "./qwen3-asr-process.js";
import { verifyQwen3AsrV13Freeze } from "./verify-qwen3-asr-v13-freeze.js";

const MODEL_REVISION = "7278e1e70fe206f11671096ffdd38061171dd6e5";
const CASE_ID = "hinglish-business";
const EXPECTED_AUDIO_SHA256 = "c46218063f37892bdec79afe09c9353cec2396bafa9ffba527ba33951949c01c";
const EXPECTED_AUDIO_BYTES = 234_818;
const PROCESS_TIMEOUT_MS = 600_000;
const ATTEMPT_ID = "qwen3-asr-v13-fixed-cuda-0-hinglish-diagnostic";
const directory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(directory, "..", "..");
const preflightPath = join(repositoryRoot, "docs", "qwen3-asr-v13-hinglish-preflight-2026-08-11.json");
const diagnosticPath = join(repositoryRoot, "docs", "qwen3-asr-v13-fixed-cuda-0-hinglish-diagnostic-process-2026-08-11.json");
const staticFreezePath = join(directory, "qwen3-asr-v13-diagnostic.freeze.json");

type FrozenCase = { id: string; reference: string; expectedLanguage: VoiceLanguage };

type AdapterPayload = {
  schemaVersion: "NITSYCLAW-QWEN3-ASR-ADAPTER-V1.1";
  status: "ok" | "error";
  mode?: "diagnostic";
  modelRevision?: string;
  cases?: Array<{
    caseId: string;
    rawTranscript: string;
    modelLanguage: string;
    providerConfidence: null;
    latencyMs: number;
  }>;
  cleanup: { cudaAllocatedBytes: number; cudaReservedBytes: number };
  networkPolicy: Record<string, unknown>;
  confidenceTelemetry: "unavailable";
  providerConfidence: null;
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

function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
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
    throw new Error("The Qwen V1.3 diagnostic directory escaped its private temp root.");
  }
}

async function currentTempArtifacts(): Promise<string[]> {
  return (await readdir(tmpdir()))
    .filter((name) => name.startsWith("nitsyclaw-voice-") || name.startsWith("nitsyclaw-tts-"))
    .sort();
}

function parseAdapterPayload(value: Record<string, unknown>): AdapterPayload {
  const candidate = value as Partial<AdapterPayload>;
  if (candidate.schemaVersion !== "NITSYCLAW-QWEN3-ASR-ADAPTER-V1.1" ||
      (candidate.status !== "ok" && candidate.status !== "error") ||
      candidate.confidenceTelemetry !== "unavailable" || candidate.providerConfidence !== null ||
      !candidate.cleanup || typeof candidate.cleanup.cudaAllocatedBytes !== "number" ||
      typeof candidate.cleanup.cudaReservedBytes !== "number" || !candidate.networkPolicy) {
    throw new Error("Qwen adapter returned an invalid frozen telemetry schema.");
  }
  if (candidate.status === "ok") {
    const result = candidate.cases?.[0];
    if (candidate.mode !== "diagnostic" || candidate.modelRevision !== MODEL_REVISION ||
        !Array.isArray(candidate.cases) || candidate.cases.length !== 1 || result?.caseId !== CASE_ID ||
        typeof result.rawTranscript !== "string" || !result.rawTranscript ||
        typeof result.modelLanguage !== "string" || result.providerConfidence !== null ||
        typeof result.latencyMs !== "number" || !Number.isFinite(result.latencyMs)) {
      throw new Error("Qwen adapter returned an invalid Hinglish diagnostic result.");
    }
  }
  return candidate as AdapterPayload;
}

function execFileText(executable: string, args: string[], timeoutMs = 5_000): Promise<string | null> {
  return new Promise((resolvePromise) => {
    // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- fixed local observability utility, fixed arguments, no shell.
    execFile(executable, args, {
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 256 * 1024,
      encoding: "utf8",
    }, (error, stdout) => resolvePromise(error ? null : stdout));
  });
}

async function eventLogBaseline(powershell: string): Promise<Record<string, unknown>> {
  const command = [
    "$ErrorActionPreference='Stop'",
    "$a=Get-WinEvent -LogName Application -MaxEvents 1",
    "$s=Get-WinEvent -LogName System -MaxEvents 1",
    "[pscustomobject]@{applicationRecordId=$a.RecordId;applicationTime=$a.TimeCreated.ToString('o');systemRecordId=$s.RecordId;systemTime=$s.TimeCreated.ToString('o')}|ConvertTo-Json -Compress",
  ].join(";");
  const output = await execFileText(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command]);
  if (!output) return { available: false };
  try {
    return { available: true, ...(JSON.parse(output) as Record<string, unknown>) };
  } catch {
    return { available: false };
  }
}

async function gpuBaseline(): Promise<Record<string, unknown>> {
  const [gpu, processes] = await Promise.all([
    execFileText("nvidia-smi.exe", [
      "--query-gpu=name,memory.total,memory.used,memory.free,driver_version",
      "--format=csv,noheader,nounits",
    ]),
    execFileText("nvidia-smi.exe", [
      "--query-compute-apps=pid,used_gpu_memory",
      "--format=csv,noheader,nounits",
    ]),
  ]);
  return {
    available: gpu !== null,
    gpu: gpu?.trim() || null,
    computeProcesses: processes?.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean) ?? null,
  };
}

async function convertToPcmWav(ffmpeg: string, input: string, output: string): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- reviewed ffmpeg path, fixed file-only arguments, no shell or network protocols.
    const child = spawn(ffmpeg, [
      "-v", "error", "-nostdin", "-protocol_whitelist", "file",
      "-max_alloc", String(64 * 1024 * 1024), "-threads", "1",
      "-i", input, "-map", "0:a:0", "-vn", "-sn", "-dn",
      "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", output,
    ], { shell: false, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderrBytes = 0;
    let stopped = false;
    const timer = setTimeout(() => {
      stopped = true;
      child.kill();
    }, 30_000);
    timer.unref?.();
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > 64 * 1024) {
        stopped = true;
        child.kill();
      }
    });
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("ffmpeg could not start."));
    });
    child.once("close", (exitCode) => {
      clearTimeout(timer);
      if (stopped || exitCode !== 0) reject(new Error("ffmpeg failed during frozen Hinglish fixture preparation."));
      else resolvePromise();
    });
  });
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) throw new Error("Qwen V1.3 diagnostic accepts no runtime arguments.");
  const frozen = await verifyQwen3AsrV13Freeze();
  const localAppData = process.env.LOCALAPPDATA ?? "";
  if (!isAbsolute(localAppData)) throw new Error("LOCALAPPDATA is unavailable.");
  const python = await reviewedFile(join(repositoryRoot, ".qwen3-asr", "venv", "Scripts", "python.exe"), "python.exe");
  const adapter = await reviewedFile(join(directory, "qwen3-asr-adapter-v13.py"), "qwen3-asr-adapter-v13.py");
  const voiceSpec = await reviewedFile(join(directory, "voice-smoke-v2-spec.json"), "voice-smoke-v2-spec.json");
  const powershell = await reviewedFile("C:\\Program Files\\PowerShell\\7\\pwsh.exe", "pwsh.exe");
  const ffmpeg = await reviewedFile(
    process.env.NITSYCLAW_FFMPEG_PATH?.trim() || join(localAppData, "Microsoft", "WinGet", "Links", "ffmpeg.exe"),
    "ffmpeg.exe",
  );
  const modelPath = join(localAppData, "NitsyClaw", "models", "Qwen3-ASR-1.7B", MODEL_REVISION);
  const spec = JSON.parse(await readFile(voiceSpec, "utf8")) as { cases?: FrozenCase[] };
  const testCase = spec.cases?.find((item) => item.id === CASE_ID);
  if (!testCase || testCase.expectedLanguage !== "hinglish") throw new Error("The frozen Hinglish fixture is unavailable or changed.");

  await access(preflightPath).then(
    () => { throw new Error("Qwen V1.3 preflight evidence already exists; repeat execution is blocked."); },
    (error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; },
  );
  await access(diagnosticPath).then(
    () => { throw new Error("Qwen V1.3 process evidence already exists; repeat execution is blocked."); },
    (error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; },
  );

  const before = await currentTempArtifacts();
  const evaluationDir = await mkdtemp(join(tmpdir(), "nitsyclaw-voice-qwen3-asr-v13-"));
  await assertPrivateTempDir(evaluationDir);
  const oggPath = join(evaluationDir, `${CASE_ID}.ogg`);
  const wavPath = join(evaluationDir, `${CASE_ID}.wav`);
  let processResult: BoundedJsonProcessResult | undefined;

  try {
    const generated = await new LocalSapiSpeechSynthesizer().synthesize({
      text: testCase.reference,
      language: testCase.expectedLanguage,
      correlationId: `qwen3-asr-${CASE_ID}`,
    });
    await writeFile(oggPath, generated.audio, { flag: "wx" });
    await convertToPcmWav(ffmpeg, oggPath, wavPath);
    const audioSha256 = await sha256File(wavPath);
    const audioBytes = (await stat(wavPath)).size;
    if (audioSha256 !== EXPECTED_AUDIO_SHA256 || audioBytes !== EXPECTED_AUDIO_BYTES) {
      throw new Error("The generated Hinglish WAV is not byte-identical to the frozen fixture.");
    }

    const pythonSha256 = await sha256Executable(python);
    const sanitizedArgs = [
      "-I", "<reviewed-qwen3-asr-adapter-v13.py>",
      "--model-path", `<pinned-model-revision:${MODEL_REVISION}>`,
      "--audio-root", "<private-synthetic-audio-root>",
      "--case", `${CASE_ID}=<private-synthetic-wav>`,
      "--max-new-tokens", "128",
      "--mode", "diagnostic",
    ];
    const invocation = {
      executableName: "python.exe",
      executableSha256: pythonSha256,
      arguments: sanitizedArgs,
      shell: false,
      environmentPolicy: "OFFLINE_ALLOWLIST_V1",
      timeoutMs: PROCESS_TIMEOUT_MS,
      attemptId: ATTEMPT_ID,
      diagnosticPath: "docs/qwen3-asr-v13-fixed-cuda-0-hinglish-diagnostic-process-2026-08-11.json",
      exactlyOneCase: true,
      scorerExecutionAuthorized: false,
      retryAuthorized: false,
    };
    const preflight = {
      schemaVersion: "NITSYCLAW-QWEN3-ASR-V1.3-PREFLIGHT-1",
      phase: "FROZEN_BEFORE_INFERENCE",
      capturedAt: new Date().toISOString(),
      startingCommit: "af2a4de10011578ff65a4b4a6ae52168fb37e554",
      staticFreezeSha256: await sha256File(staticFreezePath),
      frozenV13AggregateSha256: frozen.aggregateSha256,
      parentV11AggregateSha256: frozen.parentV11AggregateSha256,
      invocation,
      invocationSha256: sha256Json(invocation),
      fixture: { caseId: CASE_ID, sha256: audioSha256, bytes: audioBytes, synthetic: true },
      model: frozen.model,
      baseline: {
        ram: { totalBytes: totalmem(), freeBytes: freemem(), parentRssBytes: process.memoryUsage().rss },
        gpu: await gpuBaseline(),
        eventLogs: await eventLogBaseline(powershell),
        tempArtifacts: before,
      },
      networkIsolation: {
        kernelFirewallRule: false,
        pythonSocketAccess: "denied-before-third-party-imports",
        offlineEnvironmentPolicy: "OFFLINE_ALLOWLIST_V1",
        exactPidNonLoopbackMonitoring: true,
      },
    };
    await writeQwenDiagnosticAtomically(preflightPath, preflight);

    const persisted = JSON.parse(await readFile(preflightPath, "utf8")) as typeof preflight;
    const reverified = await verifyQwen3AsrV13Freeze();
    if (persisted.phase !== "FROZEN_BEFORE_INFERENCE" ||
        persisted.invocationSha256 !== sha256Json(invocation) ||
        persisted.frozenV13AggregateSha256 !== reverified.aggregateSha256 ||
        persisted.fixture.sha256 !== await sha256File(wavPath) ||
        persisted.fixture.bytes !== (await stat(wavPath)).size) {
      throw new Error("The V1.3 freeze, invocation or fixture changed before submission.");
    }

    const childArgs = [
      "-I", adapter,
      "--model-path", modelPath,
      "--audio-root", evaluationDir,
      "--case", `${CASE_ID}=${wavPath}`,
      "--max-new-tokens", "128",
      "--mode", "diagnostic",
    ];
    processResult = await runBoundedJsonProcess({
      executable: python,
      executableSha256: pythonSha256,
      args: childArgs,
      sanitizedArgs,
      attemptId: ATTEMPT_ID,
      diagnosticPath,
      timeoutMs: PROCESS_TIMEOUT_MS,
      requireTranscript: true,
      validatePayload: (payload) => {
        try {
          parseAdapterPayload(payload);
          return { valid: true };
        } catch (error) {
          return { valid: false, error: error instanceof Error ? error.message : "Qwen adapter validation failed." };
        }
      },
      redactions: [repositoryRoot, localAppData, modelPath, evaluationDir, python, adapter, wavPath, oggPath],
      cleanup: async () => {
        await rm(evaluationDir, { recursive: true, force: true, maxRetries: 2 });
        const after = await currentTempArtifacts();
        const directoryRemoved = await stat(evaluationDir).then(() => false, () => true);
        return {
          passed: directoryRemoved && JSON.stringify(before) === JSON.stringify(after),
          privateEvaluationDirectoryRemoved: directoryRemoved,
          tempArtifactSetRestored: JSON.stringify(before) === JSON.stringify(after),
        };
      },
    });

    console.log(JSON.stringify({
      schemaVersion: "NITSYCLAW-QWEN3-ASR-V1.3-DIAGNOSTIC-SUMMARY-1",
      diagnosticOnly: true,
      scored: false,
      caseId: CASE_ID,
      fixtureSha256: audioSha256,
      preflightPath,
      diagnosticPath,
      outcome: processResult.outcome,
      exitCode: processResult.exitCode,
      processId: processResult.diagnostic.processId,
      wallClockDurationMs: processResult.elapsedMs,
      transcriptParse: processResult.diagnostic.transcriptParse,
      networkRows: processResult.diagnostic.nonLoopbackTcpConnectionsObserved,
      cleanup: processResult.diagnostic.cleanup,
    }, null, 2));
    if (processResult.outcome !== "SUCCESS") process.exitCode = 1;
  } finally {
    if (!processResult) await rm(evaluationDir, { recursive: true, force: true, maxRetries: 2 });
  }
}

void main().catch((error: unknown) => {
  console.error("Qwen V1.3 Hinglish diagnostic stopped.", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
