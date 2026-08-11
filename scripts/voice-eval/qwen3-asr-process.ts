import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, open, link, mkdir, readFile, rm } from "node:fs/promises";
import { basename, dirname } from "node:path";

const DEFAULT_OUTPUT_LIMIT = 256 * 1024;
const DEFAULT_KILL_GRACE_MS = 2_000;
const DEFAULT_SAMPLE_INTERVAL_MS = 1_000;
const MAX_DIAGNOSTIC_TEXT_BYTES = 64 * 1024;

export type QwenProcessOutcome =
  | "SPAWN_FAILURE"
  | "NONZERO_EXIT"
  | "SIGNAL_TERMINATION"
  | "TIMEOUT"
  | "CANCELLED"
  | "OUTPUT_LIMIT_EXCEEDED"
  | "OOM_PROVEN"
  | "DEVICE_PLACEMENT_FAILURE"
  | "ZERO_EXIT_EMPTY_OUTPUT"
  | "MALFORMED_OUTPUT"
  | "NO_TRANSCRIPT"
  | "SUCCESS";

export type QwenResourceSample = {
  childRamBytes: number | null;
  gpuMemoryBytes: number | null;
  nonLoopbackTcpConnections: number | null;
};

type DiagnosticStream = {
  bytes: number;
  storedBytes: number;
  decoded: string;
  decodeError: boolean;
  truncated: boolean;
  ended: boolean;
  closed: boolean;
  error: string | null;
};

export type QwenProcessDiagnostic = {
  schemaVersion: "NITSYCLAW-QWEN3-ASR-PROCESS-DIAGNOSTIC-V1.1";
  phase: "FINAL";
  attemptId: string;
  invocation: {
    executableName: string;
    executableSha256: string;
    arguments: string[];
    shell: false;
    environmentPolicy: "OFFLINE_ALLOWLIST_V1";
  };
  processCreationTimestamp: string;
  processId: number | null;
  spawn: { succeeded: boolean; timestamp: string | null; error: string | null };
  lifecycle: {
    errorTimestamp: string | null;
    exitTimestamp: string | null;
    closeTimestamp: string | null;
    exitCode: number | null;
    exitSignal: NodeJS.Signals | null;
    closeCode: number | null;
    closeSignal: NodeJS.Signals | null;
    gracefulTerminationRequested: boolean;
    forcedKillRequired: boolean;
  };
  stdout: DiagnosticStream;
  stderr: DiagnosticStream;
  timedOut: boolean;
  cancelled: boolean;
  wallClockDurationMs: number;
  peakChildRamBytes: number | null;
  peakGpuMemoryBytes: number | null;
  resourceSamples: number;
  nonLoopbackTcpConnectionsObserved: number | null;
  outputTruncated: boolean;
  transcriptParse: {
    status: "EMPTY" | "MALFORMED" | "PARSED" | "NO_TRANSCRIPT";
    error: string | null;
  };
  outcome: QwenProcessOutcome;
  cleanup: { passed: boolean; [key: string]: unknown };
};

export type BoundedJsonProcessResult = {
  exitCode: number | null;
  elapsedMs: number;
  stdout: string;
  stderr: string;
  payload: Record<string, unknown> | null;
  outcome: QwenProcessOutcome;
  diagnostic: QwenProcessDiagnostic;
  diagnosticPath: string;
};

type AtomicDiagnosticWriter = (path: string, value: unknown) => Promise<void>;

type RunInput = {
  executable: string;
  executableSha256: string;
  args: string[];
  sanitizedArgs: string[];
  attemptId: string;
  diagnosticPath: string;
  timeoutMs: number;
  outputLimitBytes?: number;
  killGraceMs?: number;
  sampleIntervalMs?: number;
  signal?: AbortSignal;
  requireTranscript?: boolean;
  validatePayload?: (payload: Record<string, unknown>) => { valid: boolean; error?: string };
  redactions?: string[];
  cleanup: () => Promise<{ passed: boolean; [key: string]: unknown }>;
  resourceSampler?: (pid: number) => Promise<QwenResourceSample>;
  atomicWriter?: AtomicDiagnosticWriter;
  terminateChild?: (child: ChildProcessWithoutNullStreams, force: boolean) => boolean;
};

export class QwenDiagnosticPersistenceError extends Error {
  readonly runningDiagnosticPath: string;

  constructor(runningDiagnosticPath: string) {
    super("Qwen diagnostic persistence failed; no result may be claimed.");
    this.name = "QwenDiagnosticPersistenceError";
    this.runningDiagnosticPath = runningDiagnosticPath;
  }
}

export class QwenDiagnosticAlreadyExistsError extends Error {
  constructor() {
    super("Qwen diagnostic already exists; repeated child execution is blocked.");
    this.name = "QwenDiagnosticAlreadyExistsError";
  }
}

export function parseSingleJsonObject(stdout: string): Record<string, unknown> {
  const normalized = stdout.trim();
  if (!normalized) throw new Error("Local evaluator returned no JSON result.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new Error("Local evaluator returned partial or invalid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Local evaluator JSON result must be one object.");
  }
  return parsed as Record<string, unknown>;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function redactQwenDiagnosticText(text: string, redactions: readonly string[] = []): string {
  let output = text.replace(/\u001B\[[0-?]*[ -\x2F]*[@-~]/gu, "");
  for (const secret of redactions.filter(Boolean).sort((a, b) => b.length - a.length)) {
    output = output.split(secret).join("<redacted>");
  }
  output = output
    .replace(/\b(?:Bearer\s+)[A-Za-z0-9._~+\x2F-]+=*/giu, "Bearer <redacted>")
    .replace(/\b(api[_-]?key|authorization|password|secret|token)\s*[:=]\s*[^\s,;]+/giu, "$1=<redacted>")
    .replace(/(?:[A-Za-z]:\\|\\\\)[^\r\n\t"']+/gu, "<redacted-path>")
    .replace(/\/(?:Users|home)\/[^\s"']+/gu, "<redacted-path>");
  return output;
}

export async function writeQwenDiagnosticAtomically(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    // Hard-link publication is atomic and refuses to overwrite an earlier attempt.
    await link(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

function execFileText(executable: string, args: string[]): Promise<string | null> {
  return new Promise((resolvePromise) => {
    execFile(executable, args, {
      windowsHide: true,
      timeout: 2_000,
      maxBuffer: 256 * 1024,
      encoding: "utf8",
    }, (error, stdout) => resolvePromise(error ? null : stdout));
  });
}

function parseTasklistBytes(stdout: string | null, pid: number): number | null {
  if (!stdout || /no tasks are running/iu.test(stdout)) return null;
  const line = stdout.split(/\r?\n/u).find((entry) => entry.includes(`"${pid}"`));
  const match = line?.match(/,"([\d,.]+)\s*K"\s*$/u);
  if (!match) return null;
  const kib = Number.parseInt(match[1].replace(/[,.]/gu, ""), 10);
  return Number.isFinite(kib) ? kib * 1024 : null;
}

function parseNvidiaBytes(stdout: string | null, pid: number): number | null {
  if (!stdout) return null;
  for (const line of stdout.split(/\r?\n/u)) {
    const [rawPid, rawMib] = line.split(",").map((part) => part.trim());
    if (Number.parseInt(rawPid, 10) !== pid) continue;
    const mib = Number.parseFloat(rawMib);
    if (Number.isFinite(mib)) return Math.round(mib * 1024 * 1024);
  }
  return null;
}

function parseNonLoopbackConnections(stdout: string | null, pid: number): number | null {
  if (stdout === null) return null;
  let count = 0;
  for (const line of stdout.split(/\r?\n/u)) {
    const columns = line.trim().split(/\s+/u);
    if (columns.length < 5 || columns[0].toUpperCase() !== "TCP" || columns.at(-1) !== String(pid)) continue;
    const foreign = columns[2].toLowerCase();
    const state = columns[3].toUpperCase();
    if (state !== "ESTABLISHED") continue;
    if (foreign.startsWith("127.") || foreign.startsWith("[::1]") || foreign.startsWith("0.0.0.0:") ||
        foreign.startsWith("[::]:")) continue;
    count += 1;
  }
  return count;
}

export async function sampleQwenChildResources(pid: number): Promise<QwenResourceSample> {
  const [tasks, gpu, tcp] = await Promise.all([
    execFileText("tasklist.exe", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]),
    execFileText("nvidia-smi.exe", ["--query-compute-apps=pid,used_gpu_memory", "--format=csv,noheader,nounits"]),
    execFileText("netstat.exe", ["-ano", "-p", "TCP"]),
  ]);
  return {
    childRamBytes: parseTasklistBytes(tasks, pid),
    gpuMemoryBytes: parseNvidiaBytes(gpu, pid),
    nonLoopbackTcpConnections: parseNonLoopbackConnections(tcp, pid),
  };
}

function safeTimestamp(): string {
  return new Date().toISOString();
}

function boundedStream(chunks: Buffer[], totalBytes: number, truncated: boolean, ended: boolean, closed: boolean,
  streamError: string | null, redactions: readonly string[]): DiagnosticStream {
  const stored = Buffer.concat(chunks);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let decoded: string;
  let decodeError = false;
  try {
    decoded = decoder.decode(stored);
  } catch {
    decodeError = true;
    decoded = new TextDecoder("utf-8").decode(stored);
  }
  return {
    bytes: totalBytes,
    storedBytes: stored.byteLength,
    decoded: redactQwenDiagnosticText(decoded, redactions),
    decodeError,
    truncated,
    ended,
    closed,
    error: streamError,
  };
}

function payloadKind(payload: Record<string, unknown> | null): string | null {
  const error = payload?.error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;
  const kind = (error as Record<string, unknown>).kind;
  return typeof kind === "string" ? kind : null;
}

function payloadHasTranscript(payload: Record<string, unknown> | null): boolean {
  if (payload?.status !== "ok" || !Array.isArray(payload.cases) || payload.cases.length === 0) return false;
  return payload.cases.every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    return typeof (entry as Record<string, unknown>).rawTranscript === "string" &&
      ((entry as Record<string, unknown>).rawTranscript as string).length > 0;
  });
}

function classifyNativeFailure(stderr: string): "oom" | "device" | null {
  if (/(?:torch\.OutOfMemoryError|RuntimeError):\s*CUDA out of memory|CUDA_ERROR_OUT_OF_MEMORY|CUDA error:\s*out of memory/iu.test(stderr)) {
    return "oom";
  }
  if (/(?:RuntimeError|ValueError):\s*(?:Expected all tensors to be on the same device|invalid device ordinal|CUDA is unavailable)/iu.test(stderr)) {
    return "device";
  }
  return null;
}

function classifyOutcome(input: {
  spawnSucceeded: boolean;
  timedOut: boolean;
  cancelled: boolean;
  outputTruncated: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: DiagnosticStream;
  stderrRaw: string;
  payload: Record<string, unknown> | null;
  parseStatus: "EMPTY" | "MALFORMED" | "PARSED" | "NO_TRANSCRIPT";
  requireTranscript: boolean;
}): QwenProcessOutcome {
  if (!input.spawnSucceeded) return "SPAWN_FAILURE";
  if (input.timedOut) return "TIMEOUT";
  if (input.cancelled) return "CANCELLED";
  if (input.outputTruncated) return "OUTPUT_LIMIT_EXCEEDED";
  const reported = payloadKind(input.payload);
  const native = classifyNativeFailure(input.stderrRaw);
  if (reported === "oom" || native === "oom") return "OOM_PROVEN";
  if (reported === "device_placement" || native === "device") return "DEVICE_PLACEMENT_FAILURE";
  if (input.signal) return "SIGNAL_TERMINATION";
  if (reported === "no_transcript") return "NO_TRANSCRIPT";
  if (input.exitCode !== 0) return "NONZERO_EXIT";
  if (input.stdout.bytes === 0) return "ZERO_EXIT_EMPTY_OUTPUT";
  if (input.parseStatus === "MALFORMED") return "MALFORMED_OUTPUT";
  if (input.requireTranscript && !payloadHasTranscript(input.payload)) return "NO_TRANSCRIPT";
  return "SUCCESS";
}

async function safeCleanup(input: RunInput): Promise<{ passed: boolean; [key: string]: unknown }> {
  try {
    const result = await input.cleanup();
    return result && typeof result.passed === "boolean" ? result : { passed: false, error: "invalid cleanup result" };
  } catch (error) {
    return {
      passed: false,
      error: redactQwenDiagnosticText(error instanceof Error ? error.message : "cleanup failed", input.redactions),
    };
  }
}

export async function runBoundedJsonProcess(input: RunInput): Promise<BoundedJsonProcessResult> {
  if (!/^[a-z0-9][a-z0-9._-]{0,95}$/u.test(input.attemptId)) throw new Error("Qwen diagnostic attempt id is invalid.");
  if (!/^[a-f0-9]{64}$/u.test(input.executableSha256)) throw new Error("Qwen executable hash is invalid.");
  if (input.args.length !== input.sanitizedArgs.length) throw new Error("Qwen sanitized argument structure is incomplete.");

  const writer = input.atomicWriter ?? writeQwenDiagnosticAtomically;
  const runningPath = `${input.diagnosticPath}.running`;
  const createdAt = safeTimestamp();
  const invocation = {
    executableName: basename(input.executable),
    executableSha256: input.executableSha256,
    arguments: input.sanitizedArgs.map((argument) => redactQwenDiagnosticText(argument, input.redactions)),
    shell: false as const,
    environmentPolicy: "OFFLINE_ALLOWLIST_V1" as const,
  };
  try {
    await access(input.diagnosticPath);
    await safeCleanup(input);
    throw new QwenDiagnosticAlreadyExistsError();
  } catch (error) {
    if (error instanceof QwenDiagnosticAlreadyExistsError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      await safeCleanup(input);
      throw new QwenDiagnosticPersistenceError(runningPath);
    }
  }
  try {
    await writer(runningPath, {
      schemaVersion: "NITSYCLAW-QWEN3-ASR-PROCESS-DIAGNOSTIC-V1.1",
      phase: "RUNNING",
      attemptId: input.attemptId,
      invocation,
      processCreationTimestamp: createdAt,
      outcome: null,
      cleanup: { passed: false, pending: true },
    });
  } catch {
    await safeCleanup(input);
    throw new QwenDiagnosticPersistenceError(runningPath);
  }

  const started = performance.now();
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  const outputLimit = input.outputLimitBytes ?? DEFAULT_OUTPUT_LIMIT;
  const killGraceMs = input.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let stdoutTruncated = false;
  let stderrTruncated = false;
  let stdoutEnded = false;
  let stderrEnded = false;
  let stdoutClosed = false;
  let stderrClosed = false;
  let stdoutError: string | null = null;
  let stderrError: string | null = null;
  let spawnSucceeded = false;
  let spawnTimestamp: string | null = null;
  let spawnError: string | null = null;
  let errorTimestamp: string | null = null;
  let exitTimestamp: string | null = null;
  let closeTimestamp: string | null = null;
  let exitCode: number | null = null;
  let exitSignal: NodeJS.Signals | null = null;
  let closeCode: number | null = null;
  let closeSignal: NodeJS.Signals | null = null;
  let timedOut = false;
  let cancelled = false;
  let gracefulTerminationRequested = false;
  let forcedKillRequired = false;
  let child: ChildProcessWithoutNullStreams | null = null;
  let peakChildRamBytes: number | null = null;
  let peakGpuMemoryBytes: number | null = null;
  let resourceSamples = 0;
  let nonLoopbackTcpConnectionsObserved: number | null = null;
  let sampleInFlight: Promise<void> | null = null;
  let timeoutHandle: NodeJS.Timeout | null = null;
  let forceKillHandle: NodeJS.Timeout | null = null;
  let sampleHandle: NodeJS.Timeout | null = null;
  let closed = false;

  const updateResources = async () => {
    if (!child?.pid) return;
    const sampler = input.resourceSampler ?? sampleQwenChildResources;
    try {
      const sample = await sampler(child.pid);
      resourceSamples += 1;
      if (sample.childRamBytes !== null) peakChildRamBytes = Math.max(peakChildRamBytes ?? 0, sample.childRamBytes);
      if (sample.gpuMemoryBytes !== null) peakGpuMemoryBytes = Math.max(peakGpuMemoryBytes ?? 0, sample.gpuMemoryBytes);
      if (sample.nonLoopbackTcpConnections !== null) {
        nonLoopbackTcpConnectionsObserved = Math.max(nonLoopbackTcpConnectionsObserved ?? 0, sample.nonLoopbackTcpConnections);
      }
    } catch {
      // Resource telemetry is best-effort and its availability is explicit in the final diagnostic.
    }
  };
  const scheduleSample = () => {
    if (sampleInFlight) return;
    sampleInFlight = updateResources().finally(() => { sampleInFlight = null; });
  };
  const requestTermination = () => {
    if (!child || closed || gracefulTerminationRequested) return;
    gracefulTerminationRequested = true;
    const terminate = input.terminateChild ?? ((target: ChildProcessWithoutNullStreams, force: boolean) =>
      target.kill(force ? "SIGKILL" : "SIGTERM"));
    terminate(child, false);
    forceKillHandle = setTimeout(() => {
      if (closed || !child) return;
      forcedKillRequired = true;
      terminate(child, true);
    }, killGraceMs);
    forceKillHandle.unref?.();
  };
  const collect = (target: Buffer[], chunk: Buffer, stream: "stdout" | "stderr") => {
    const copied = Buffer.from(chunk);
    if (stream === "stdout") stdoutBytes += copied.byteLength;
    else stderrBytes += copied.byteLength;
    const storedBytes = target.reduce((sum, item) => sum + item.byteLength, 0);
    const remaining = Math.max(0, Math.min(outputLimit, MAX_DIAGNOSTIC_TEXT_BYTES) - storedBytes);
    if (remaining > 0) target.push(copied.subarray(0, remaining));
    if ((stream === "stdout" ? stdoutBytes : stderrBytes) > outputLimit) {
      if (stream === "stdout") stdoutTruncated = true;
      else stderrTruncated = true;
      requestTermination();
    }
  };

  try {
    try {
      // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- caller realpath-reviews the executable/script; shell is disabled and the environment is forced offline.
      child = spawn(input.executable, input.args, {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          ALL_PROXY: "http://127.0.0.1:9",
          DO_NOT_TRACK: "1",
          GRADIO_ANALYTICS_ENABLED: "False",
          HF_HUB_DISABLE_TELEMETRY: "1",
          HF_HUB_OFFLINE: "1",
          HTTPS_PROXY: "http://127.0.0.1:9",
          HTTP_PROXY: "http://127.0.0.1:9",
          NO_PROXY: "",
          PYTHONHASHSEED: "0",
          TOKENIZERS_PARALLELISM: "false",
          TRANSFORMERS_OFFLINE: "1",
        },
      });
    } catch (error) {
      spawnError = redactQwenDiagnosticText(error instanceof Error ? error.message : "spawn failed", input.redactions);
      errorTimestamp = safeTimestamp();
    }

    if (child) {
      const closePromise = new Promise<void>((resolveClose) => {
        child!.once("spawn", () => {
          spawnSucceeded = true;
          spawnTimestamp = safeTimestamp();
          scheduleSample();
        });
        child!.once("error", (error) => {
          errorTimestamp = safeTimestamp();
          spawnError = redactQwenDiagnosticText(error.message || "spawn failed", input.redactions);
        });
        child!.once("exit", (code, signal) => {
          exitTimestamp = safeTimestamp();
          exitCode = code;
          exitSignal = signal;
        });
        child!.once("close", (code, signal) => {
          closed = true;
          closeTimestamp = safeTimestamp();
          closeCode = code;
          closeSignal = signal;
          resolveClose();
        });
      });
      const stdoutComplete = new Promise<void>((resolveStream) => {
        child!.stdout.on("data", (chunk: Buffer) => collect(stdoutChunks, chunk, "stdout"));
        child!.stdout.once("end", () => { stdoutEnded = true; });
        child!.stdout.once("error", (error) => { stdoutError = redactQwenDiagnosticText(error.message, input.redactions); });
        child!.stdout.once("close", () => { stdoutClosed = true; resolveStream(); });
      });
      const stderrComplete = new Promise<void>((resolveStream) => {
        child!.stderr.on("data", (chunk: Buffer) => collect(stderrChunks, chunk, "stderr"));
        child!.stderr.once("end", () => { stderrEnded = true; });
        child!.stderr.once("error", (error) => { stderrError = redactQwenDiagnosticText(error.message, input.redactions); });
        child!.stderr.once("close", () => { stderrClosed = true; resolveStream(); });
      });

      const onAbort = () => {
        cancelled = true;
        requestTermination();
      };
      if (input.signal?.aborted) onAbort();
      else input.signal?.addEventListener("abort", onAbort, { once: true });
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        requestTermination();
      }, input.timeoutMs);
      timeoutHandle.unref?.();
      sampleHandle = setInterval(scheduleSample, input.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS);
      sampleHandle.unref?.();

      await closePromise;
      await Promise.all([stdoutComplete, stderrComplete]);
      input.signal?.removeEventListener("abort", onAbort);
      scheduleSample();
      if (sampleInFlight) await sampleInFlight;
    }
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (forceKillHandle) clearTimeout(forceKillHandle);
    if (sampleHandle) clearInterval(sampleHandle);
  }

  const stdout = boundedStream(stdoutChunks, stdoutBytes, stdoutTruncated, stdoutEnded, stdoutClosed, stdoutError, input.redactions ?? []);
  const stderr = boundedStream(stderrChunks, stderrBytes, stderrTruncated, stderrEnded, stderrClosed, stderrError, input.redactions ?? []);
  const rawStdout = Buffer.concat(stdoutChunks).toString("utf8");
  const rawStderr = Buffer.concat(stderrChunks).toString("utf8");
  let payload: Record<string, unknown> | null = null;
  let parseStatus: "EMPTY" | "MALFORMED" | "PARSED" | "NO_TRANSCRIPT" = stdout.bytes === 0 ? "EMPTY" : "PARSED";
  let parseError: string | null = null;
  if (stdout.bytes > 0) {
    try {
      if (stdout.decodeError) throw new Error("Local evaluator output was not valid UTF-8.");
      payload = parseSingleJsonObject(rawStdout);
      const validation = input.validatePayload?.(payload);
      if (validation && !validation.valid) {
        parseStatus = "MALFORMED";
        parseError = validation.error ?? "Local evaluator JSON result failed schema validation.";
      }
    } catch (error) {
      parseStatus = "MALFORMED";
      parseError = error instanceof Error ? error.message : "Local evaluator output could not be parsed.";
    }
  }
  if (parseStatus === "PARSED" && input.requireTranscript && payload && !payloadHasTranscript(payload)) parseStatus = "NO_TRANSCRIPT";
  const outcome = classifyOutcome({
    spawnSucceeded,
    timedOut,
    cancelled,
    outputTruncated: stdoutTruncated || stderrTruncated,
    exitCode: closeCode ?? exitCode,
    signal: closeSignal ?? exitSignal,
    stdout,
    stderrRaw: rawStderr,
    payload,
    parseStatus,
    requireTranscript: input.requireTranscript ?? false,
  });

  const resources = payload?.resources;
  if (resources && typeof resources === "object" && !Array.isArray(resources)) {
    const reportedRam = (resources as Record<string, unknown>).processPeakRssBytes;
    const reportedGpu = (resources as Record<string, unknown>).cudaPeakReservedBytes;
    if (typeof reportedRam === "number" && Number.isFinite(reportedRam)) peakChildRamBytes = Math.max(peakChildRamBytes ?? 0, reportedRam);
    if (typeof reportedGpu === "number" && Number.isFinite(reportedGpu)) peakGpuMemoryBytes = Math.max(peakGpuMemoryBytes ?? 0, reportedGpu);
  }
  const cleanup = await safeCleanup(input);
  const diagnostic: QwenProcessDiagnostic = {
    schemaVersion: "NITSYCLAW-QWEN3-ASR-PROCESS-DIAGNOSTIC-V1.1",
    phase: "FINAL",
    attemptId: input.attemptId,
    invocation,
    processCreationTimestamp: createdAt,
    processId: child?.pid ?? null,
    spawn: { succeeded: spawnSucceeded, timestamp: spawnTimestamp, error: spawnError },
    lifecycle: {
      errorTimestamp,
      exitTimestamp,
      closeTimestamp,
      exitCode,
      exitSignal,
      closeCode,
      closeSignal,
      gracefulTerminationRequested,
      forcedKillRequired,
    },
    stdout,
    stderr,
    timedOut,
    cancelled,
    wallClockDurationMs: Math.round(performance.now() - started),
    peakChildRamBytes,
    peakGpuMemoryBytes,
    resourceSamples,
    nonLoopbackTcpConnectionsObserved,
    outputTruncated: stdoutTruncated || stderrTruncated,
    transcriptParse: { status: parseStatus, error: parseError },
    outcome,
    cleanup,
  };

  try {
    await writer(input.diagnosticPath, diagnostic);
    await rm(runningPath, { force: true });
  } catch {
    throw new QwenDiagnosticPersistenceError(runningPath);
  }

  return {
    exitCode: closeCode ?? exitCode,
    elapsedMs: diagnostic.wallClockDurationMs,
    stdout: stdout.decoded,
    stderr: stderr.decoded,
    payload,
    outcome,
    diagnostic,
    diagnosticPath: input.diagnosticPath,
  };
}

export async function sha256Executable(path: string): Promise<string> {
  return sha256(await readFile(path));
}
