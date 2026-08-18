import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseSingleJsonObject,
  QwenDiagnosticAlreadyExistsError,
  QwenDiagnosticPersistenceError,
  runBoundedJsonProcess,
  writeQwenDiagnosticAtomically,
  type BoundedJsonProcessResult,
  type QwenResourceSample,
} from "./qwen3-asr-process.js";

const TEST_EXECUTABLE_SHA256 = "a".repeat(64);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true, maxRetries: 2 })));
});

async function testRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "nitsyclaw-qwen-process-test-"));
  roots.push(root);
  return root;
}

async function runFixture(options: {
  script?: string;
  executable?: string;
  timeoutMs?: number;
  killGraceMs?: number;
  outputLimitBytes?: number;
  requireTranscript?: boolean;
  signal?: AbortSignal;
  redactions?: string[];
  resourceSampler?: (pid: number) => Promise<QwenResourceSample>;
  atomicWriter?: typeof writeQwenDiagnosticAtomically;
  terminateChild?: (child: ChildProcessWithoutNullStreams, force: boolean) => boolean;
  attemptId?: string;
} = {}): Promise<{ result: BoundedJsonProcessResult; root: string; cleanupCalls: number }> {
  const root = await testRoot();
  const evaluation = join(root, "evaluation");
  await mkdir(evaluation);
  await writeFile(join(evaluation, "synthetic.wav"), "fixture", "utf8");
  let cleanupCalls = 0;
  const script = options.script ?? "console.log(JSON.stringify({status:'ok',cases:[{rawTranscript:'synthetic transcript'}]}))";
  const args = ["-e", script];
  const result = await runBoundedJsonProcess({
    executable: options.executable ?? process.execPath,
    executableSha256: TEST_EXECUTABLE_SHA256,
    args,
    sanitizedArgs: ["-e", "<synthetic-child-fixture>"],
    attemptId: options.attemptId ?? "test-attempt",
    diagnosticPath: join(root, "diagnostic.json"),
    timeoutMs: options.timeoutMs ?? 5_000,
    killGraceMs: options.killGraceMs,
    sampleIntervalMs: 5,
    outputLimitBytes: options.outputLimitBytes,
    requireTranscript: options.requireTranscript ?? true,
    signal: options.signal,
    redactions: options.redactions,
    resourceSampler: options.resourceSampler ?? (async () => ({
      childRamBytes: 12_345,
      gpuMemoryBytes: 67_890,
      nonLoopbackTcpConnections: 0,
    })),
    atomicWriter: options.atomicWriter,
    terminateChild: options.terminateChild,
    cleanup: async () => {
      cleanupCalls += 1;
      await rm(evaluation, { recursive: true, force: true });
      return { passed: true, evaluationDirectoryRemoved: true };
    },
  });
  await expect(access(evaluation)).rejects.toThrow();
  return { result, root, cleanupCalls };
}

describe("Qwen3-ASR V1.1 durable process diagnostics", () => {
  it("accepts exactly one complete JSON object", () => {
    expect(parseSingleJsonObject('{"status":"ok"}\n')).toEqual({ status: "ok" });
  });

  it.each(["", "{\"status\":", "[]", "{}\n{}"]) ("rejects empty, partial, or multiple output: %j", (output) => {
    expect(() => parseSingleJsonObject(output)).toThrow(/JSON|object/u);
  });

  it("records successful stdout and exit zero after both streams close", async () => {
    const { result, cleanupCalls } = await runFixture();
    expect(result.outcome).toBe("SUCCESS");
    expect(result.diagnostic.spawn.succeeded).toBe(true);
    expect(result.diagnostic.lifecycle.exitCode).toBe(0);
    expect(result.diagnostic.lifecycle.closeCode).toBe(0);
    expect(result.diagnostic.stdout.ended).toBe(true);
    expect(result.diagnostic.stdout.closed).toBe(true);
    expect(result.diagnostic.stderr.ended).toBe(true);
    expect(result.diagnostic.stderr.closed).toBe(true);
    expect(result.diagnostic.transcriptParse.status).toBe("PARSED");
    expect(cleanupCalls).toBe(1);
  });

  it("forces the child environment offline without recording the full environment", async () => {
    const { result, root } = await runFixture({
      script: "console.log(JSON.stringify({status:'ok',cases:[{rawTranscript:[process.env.HF_HUB_OFFLINE,process.env.TRANSFORMERS_OFFLINE,process.env.HTTPS_PROXY].join('|')}]}))",
    });
    expect(result.payload?.cases).toEqual([{ rawTranscript: "1|1|http://127.0.0.1:9" }]);
    const diagnostic = await readFile(join(root, "diagnostic.json"), "utf8");
    expect(diagnostic).toContain('"environmentPolicy": "OFFLINE_ALLOWLIST_V1"');
    expect(diagnostic).not.toContain("process.env");
  });

  it("preserves bounded stderr and a non-zero exit", async () => {
    const { result, cleanupCalls } = await runFixture({
      script: "process.stderr.write('causal fixture failure\\n');process.exit(23)",
    });
    expect(result.outcome).toBe("NONZERO_EXIT");
    expect(result.exitCode).toBe(23);
    expect(result.stderr).toContain("causal fixture failure");
    expect(result.diagnostic.stderr.bytes).toBeGreaterThan(0);
    expect(cleanupCalls).toBe(1);
  });

  it("classifies empty stdout with exit zero", async () => {
    const { result, cleanupCalls } = await runFixture({ script: "process.exit(0)" });
    expect(result.outcome).toBe("ZERO_EXIT_EMPTY_OUTPUT");
    expect(result.diagnostic.transcriptParse.status).toBe("EMPTY");
    expect(cleanupCalls).toBe(1);
  });

  it("preserves empty stdout plus a non-zero exit", async () => {
    const { result, cleanupCalls } = await runFixture({ script: "process.exit(19)" });
    expect(result.outcome).toBe("NONZERO_EXIT");
    expect(result.exitCode).toBe(19);
    expect(result.diagnostic.transcriptParse.status).toBe("EMPTY");
    expect(cleanupCalls).toBe(1);
  });

  it("persists spawn failure without waiting for output", async () => {
    const root = await testRoot();
    const evaluation = join(root, "evaluation");
    await mkdir(evaluation);
    let cleanupCalls = 0;
    const result = await runBoundedJsonProcess({
      executable: join(root, "missing-python.exe"),
      executableSha256: TEST_EXECUTABLE_SHA256,
      args: ["-I"],
      sanitizedArgs: ["-I"],
      attemptId: "spawn-failure",
      diagnosticPath: join(root, "diagnostic.json"),
      timeoutMs: 1_000,
      resourceSampler: async () => ({ childRamBytes: null, gpuMemoryBytes: null, nonLoopbackTcpConnections: null }),
      cleanup: async () => {
        cleanupCalls += 1;
        await rm(evaluation, { recursive: true, force: true });
        return { passed: true };
      },
    });
    expect(result.outcome).toBe("SPAWN_FAILURE");
    expect(result.diagnostic.spawn.error).toBeTruthy();
    expect(cleanupCalls).toBe(1);
  });

  it("captures a child that exits immediately before asynchronous work", async () => {
    const { result } = await runFixture({
      script: "process.stdout.write(JSON.stringify({status:'ok',cases:[{rawTranscript:'early'}]}));process.exit(0)",
    });
    expect(result.outcome).toBe("SUCCESS");
    expect(result.diagnostic.lifecycle.exitTimestamp).toBeTruthy();
    expect(result.diagnostic.lifecycle.closeTimestamp).toBeTruthy();
  });

  it("waits through a stdout/stderr race", async () => {
    const { result } = await runFixture({
      script: "setTimeout(()=>process.stderr.write('late stderr'),5);setTimeout(()=>process.stdout.write(JSON.stringify({status:'ok',cases:[{rawTranscript:'race'}]})),1);setTimeout(()=>process.exit(0),15)",
    });
    expect(result.outcome).toBe("SUCCESS");
    expect(result.stderr).toContain("late stderr");
    expect(result.diagnostic.stdout.closed).toBe(true);
    expect(result.diagnostic.stderr.closed).toBe(true);
  });

  it("bounds large stderr, marks truncation, and terminates", async () => {
    const { result, cleanupCalls } = await runFixture({
      script: "process.stderr.write('x'.repeat(8192));setInterval(()=>{},1000)",
      outputLimitBytes: 128,
      killGraceMs: 50,
      timeoutMs: 2_000,
    });
    expect(result.outcome).toBe("OUTPUT_LIMIT_EXCEEDED");
    expect(result.diagnostic.stderr.bytes).toBeGreaterThan(128);
    expect(result.diagnostic.stderr.storedBytes).toBeLessThanOrEqual(128);
    expect(result.diagnostic.outputTruncated).toBe(true);
    expect(cleanupCalls).toBe(1);
  });

  it("rejects malformed UTF-8 deterministically", async () => {
    const { result } = await runFixture({ script: "process.stdout.write(Buffer.from([255,254,253]))" });
    expect(result.outcome).toBe("MALFORMED_OUTPUT");
    expect(result.diagnostic.stdout.decodeError).toBe(true);
    expect(result.diagnostic.transcriptParse.status).toBe("MALFORMED");
  });

  it("rejects malformed JSON deterministically", async () => {
    const { result } = await runFixture({ script: "process.stdout.write('{\"status\":')" });
    expect(result.outcome).toBe("MALFORMED_OUTPUT");
    expect(result.diagnostic.transcriptParse.error).toMatch(/invalid JSON/u);
  });

  it("classifies valid JSON that fails the frozen adapter schema as malformed", async () => {
    const root = await testRoot();
    const evaluation = join(root, "evaluation");
    await mkdir(evaluation);
    const args = ["-e", "console.log(JSON.stringify({status:'ok',cases:[{rawTranscript:'synthetic'}]}))"];
    const result = await runBoundedJsonProcess({
      executable: process.execPath,
      executableSha256: TEST_EXECUTABLE_SHA256,
      args,
      sanitizedArgs: ["-e", "<synthetic-child-fixture>"],
      attemptId: "schema-mismatch",
      diagnosticPath: join(root, "diagnostic.json"),
      timeoutMs: 5_000,
      requireTranscript: true,
      validatePayload: () => ({ valid: false, error: "frozen adapter schema mismatch" }),
      resourceSampler: async () => ({ childRamBytes: null, gpuMemoryBytes: null, nonLoopbackTcpConnections: 0 }),
      cleanup: async () => {
        await rm(evaluation, { recursive: true, force: true });
        return { passed: true };
      },
    });
    expect(result.outcome).toBe("MALFORMED_OUTPUT");
    expect(result.diagnostic.transcriptParse.error).toBe("frozen adapter schema mismatch");
  });

  it("records timeout with graceful termination", async () => {
    const { result, cleanupCalls } = await runFixture({
      script: "process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000)",
      timeoutMs: 30,
      killGraceMs: 500,
    });
    expect(result.outcome).toBe("TIMEOUT");
    expect(result.diagnostic.timedOut).toBe(true);
    expect(result.diagnostic.lifecycle.gracefulTerminationRequested).toBe(true);
    expect(result.diagnostic.lifecycle.forcedKillRequired).toBe(false);
    expect(cleanupCalls).toBe(1);
  });

  it("escalates a timeout when graceful termination is ignored", async () => {
    const { result, cleanupCalls } = await runFixture({
      script: "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)",
      timeoutMs: 30,
      killGraceMs: 30,
      terminateChild: (child, force) => force ? child.kill("SIGKILL") : true,
    });
    expect(result.outcome).toBe("TIMEOUT");
    expect(result.diagnostic.lifecycle.gracefulTerminationRequested).toBe(true);
    expect(result.diagnostic.lifecycle.forcedKillRequired).toBe(true);
    expect(cleanupCalls).toBe(1);
  });

  it("records cancellation separately from timeout", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    const { result, cleanupCalls } = await runFixture({
      script: "setInterval(()=>{},1000)",
      timeoutMs: 5_000,
      signal: controller.signal,
    });
    expect(result.outcome).toBe("CANCELLED");
    expect(result.diagnostic.cancelled).toBe(true);
    expect(result.diagnostic.timedOut).toBe(false);
    expect(cleanupCalls).toBe(1);
  });

  it("records a deterministic child crash exit", async () => {
    const { result, cleanupCalls } = await runFixture({
      script: "process.stderr.write('fatal child crash fixture');process.exit(134)",
    });
    expect(result.outcome).toBe("NONZERO_EXIT");
    expect(result.exitCode).toBe(134);
    expect(result.stderr).toContain("fatal child crash fixture");
    expect(cleanupCalls).toBe(1);
  });

  it("classifies a structured CUDA OOM as proven", async () => {
    const { result } = await runFixture({
      script: "console.log(JSON.stringify({status:'error',error:{kind:'oom',class:'OutOfMemoryError'}}));process.exit(2)",
    });
    expect(result.outcome).toBe("OOM_PROVEN");
  });

  it("does not classify arbitrary text containing out of memory as OOM", async () => {
    const { result } = await runFixture({
      script: "process.stderr.write('customer said out of memory in a synthetic sentence');process.exit(2)",
    });
    expect(result.outcome).toBe("NONZERO_EXIT");
  });

  it("classifies a structured device-placement failure", async () => {
    const { result } = await runFixture({
      script: "console.log(JSON.stringify({status:'error',error:{kind:'device_placement',class:'RuntimeError'}}));process.exit(2)",
    });
    expect(result.outcome).toBe("DEVICE_PLACEMENT_FAILURE");
  });

  it("distinguishes parsed output with no transcript", async () => {
    const { result } = await runFixture({
      script: "console.log(JSON.stringify({status:'ok',cases:[{rawTranscript:''}]}))",
    });
    expect(result.outcome).toBe("NO_TRANSCRIPT");
    expect(result.diagnostic.transcriptParse.status).toBe("NO_TRANSCRIPT");
  });

  it("retains a truthful running record when final atomic persistence is interrupted", async () => {
    const root = await testRoot();
    const evaluation = join(root, "evaluation");
    await mkdir(evaluation);
    const diagnosticPath = join(root, "diagnostic.json");
    const priorPath = join(root, "prior-attempt.json");
    await writeFile(priorPath, "prior verified evidence", "utf8");
    let writes = 0;
    let cleanupCalls = 0;
    await expect(runBoundedJsonProcess({
      executable: process.execPath,
      executableSha256: TEST_EXECUTABLE_SHA256,
      args: ["-e", "console.log(JSON.stringify({status:'ok',cases:[{rawTranscript:'synthetic'}]}))"],
      sanitizedArgs: ["-e", "<synthetic-child-fixture>"],
      attemptId: "write-interruption",
      diagnosticPath,
      timeoutMs: 5_000,
      resourceSampler: async () => ({ childRamBytes: null, gpuMemoryBytes: null, nonLoopbackTcpConnections: 0 }),
      atomicWriter: async (path, value) => {
        writes += 1;
        if (writes === 2) throw new Error("simulated disk interruption");
        await writeQwenDiagnosticAtomically(path, value);
      },
      cleanup: async () => {
        cleanupCalls += 1;
        await rm(evaluation, { recursive: true, force: true });
        return { passed: true };
      },
    })).rejects.toBeInstanceOf(QwenDiagnosticPersistenceError);
    expect(cleanupCalls).toBe(1);
    expect(await readFile(`${diagnosticPath}.running`, "utf8")).toContain('"phase": "RUNNING"');
    expect(await readFile(priorPath, "utf8")).toBe("prior verified evidence");
    await expect(access(diagnosticPath)).rejects.toThrow();
  });

  it("blocks a repeated final path before the child can execute", async () => {
    const root = await testRoot();
    const evaluation = join(root, "evaluation");
    const marker = join(root, "child-executed.txt");
    const diagnosticPath = join(root, "diagnostic.json");
    await mkdir(evaluation);
    await writeFile(diagnosticPath, "prior final evidence", "utf8");
    let cleanupCalls = 0;
    await expect(runBoundedJsonProcess({
      executable: process.execPath,
      executableSha256: TEST_EXECUTABLE_SHA256,
      args: ["-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)},'unsafe rerun')`],
      sanitizedArgs: ["-e", "<must-not-run>"],
      attemptId: "duplicate-final",
      diagnosticPath,
      timeoutMs: 5_000,
      cleanup: async () => {
        cleanupCalls += 1;
        await rm(evaluation, { recursive: true, force: true });
        return { passed: true };
      },
    })).rejects.toBeInstanceOf(QwenDiagnosticAlreadyExistsError);
    expect(cleanupCalls).toBe(1);
    expect(await readFile(diagnosticPath, "utf8")).toBe("prior final evidence");
    await expect(access(marker)).rejects.toThrow();
  });

  it("redacts secrets, environment-like values, and private paths", async () => {
    const secret = ["super", "private", "fixture", "value"].join("-");
    const { result, root } = await runFixture({
      script: `process.stderr.write('token=${secret} C:\\\\Users\\\\Private\\\\recording.wav');console.log(JSON.stringify({status:'ok',cases:[{rawTranscript:'synthetic'}]}))`,
      redactions: [secret],
    });
    const diagnostic = await readFile(join(root, "diagnostic.json"), "utf8");
    expect(result.outcome).toBe("SUCCESS");
    expect(diagnostic).not.toContain(secret);
    expect(diagnostic).not.toContain("Users\\\\Private");
    expect(diagnostic).toContain("<redacted>");
    expect(diagnostic).toContain("<redacted-path>");
  });

  it("records peak resources and zero observed non-loopback connections", async () => {
    let sample = 0;
    const { result } = await runFixture({
      script: "setTimeout(()=>console.log(JSON.stringify({status:'ok',cases:[{rawTranscript:'resources'}]})),30)",
      resourceSampler: async () => {
        sample += 1;
        return { childRamBytes: sample * 100, gpuMemoryBytes: sample * 200, nonLoopbackTcpConnections: 0 };
      },
    });
    expect(result.diagnostic.resourceSamples).toBeGreaterThan(0);
    expect(result.diagnostic.peakChildRamBytes).toBeGreaterThanOrEqual(100);
    expect(result.diagnostic.peakGpuMemoryBytes).toBeGreaterThanOrEqual(200);
    expect(result.diagnostic.nonLoopbackTcpConnectionsObserved).toBe(0);
  });

  it("produces deterministic classification and redaction across repeated runs", async () => {
    const repeatSecret = ["repeat", "fixture", "value"].join("-");
    const first = await runFixture({
      attemptId: "repeat-one",
      script: `process.stderr.write('token=${repeatSecret}');process.exit(17)`,
      redactions: [repeatSecret],
    });
    const second = await runFixture({
      attemptId: "repeat-two",
      script: `process.stderr.write('token=${repeatSecret}');process.exit(17)`,
      redactions: [repeatSecret],
    });
    const project = (result: BoundedJsonProcessResult) => ({
      outcome: result.outcome,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      parse: result.diagnostic.transcriptParse,
      cleanup: result.diagnostic.cleanup,
      outputTruncated: result.diagnostic.outputTruncated,
    });
    expect(project(first.result)).toEqual(project(second.result));
  });
});
