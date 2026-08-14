import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative } from "node:path";
import { LocalSapiSpeechSynthesizer } from "../../apps/bot/src/local-speech-synthesizer.js";
import type { VoiceLanguage } from "@nitsyclaw/shared/voice";
import { getVoiceSmokeV2Manifest, scoreVoiceSmokeV2 } from "./scoring-v2.js";
import { verifyVoiceSmokeV2Freeze } from "./verify-v2-freeze.js";

const NEMOTRON_MODEL = "handy-computer/nemotron-3.5-asr-streaming-0.6b-gguf/nemotron-3.5-asr-streaming-0.6b-Q8_0.gguf";
const WHISPER_MODEL = "ggml-large-v3";
const WHISPER_SIZE = 3_095_033_483;
const WHISPER_SHA256 = "64d182b440b98d5203c4f9bd541544d84c605196c4f7b845dfa11fb23594d1e2";
const PROCESS_OUTPUT_LIMIT = 256 * 1024;
const PROCESS_TIMEOUT_MS = 600_000;

type ProcessResult = { stdout: string; stderr: string; elapsedMs: number };

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

async function reviewedExecutable(path: string, expectedName: string): Promise<string> {
  if (!path || !isAbsolute(path) || basename(path).toLowerCase() !== expectedName) {
    throw new Error(`${expectedName} is not configured as an absolute reviewed path.`);
  }
  const resolved = await realpath(path);
  if (basename(resolved).toLowerCase() !== expectedName || !(await lstat(resolved)).isFile()) {
    throw new Error(`${expectedName} did not resolve to a reviewed local file.`);
  }
  return resolved;
}

function runBounded(executable: string, args: string[], timeoutMs: number): Promise<ProcessResult> {
  return new Promise((resolvePromise, reject) => {
    const started = performance.now();
    // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- both executables are realpath-validated local binaries; arguments are fixed, shell is disabled, and the child environment is forced offline.
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        HF_HUB_OFFLINE: "1",
        TRANSFORMERS_OFFLINE: "1",
        HF_HUB_DISABLE_TELEMETRY: "1",
        DO_NOT_TRACK: "1",
        HTTP_PROXY: "http://127.0.0.1:9",
        HTTPS_PROXY: "http://127.0.0.1:9",
        ALL_PROXY: "http://127.0.0.1:9",
        NO_PROXY: "",
        RUST_LOG: "error",
        NO_COLOR: "1",
      },
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolvePromise({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        elapsedMs: Math.round(performance.now() - started),
      });
    };
    const collect = (target: Buffer[], chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > PROCESS_OUTPUT_LIMIT) {
        child.kill();
        finish(new Error("Local evaluator exceeded its bounded output limit."));
        return;
      }
      target.push(Buffer.from(chunk));
    };
    child.stdout.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk));
    child.once("error", () => finish(new Error("Local evaluator could not start.")));
    child.once("close", (code) => code === 0 ? finish() : finish(new Error(`Local evaluator exited with code ${code ?? "unknown"}.`)));
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("Local evaluator exceeded its bounded deadline."));
    }, timeoutMs);
    timer.unref?.();
  });
}

async function currentTempArtifacts(): Promise<string[]> {
  return (await readdir(tmpdir()))
    .filter((name) => name.startsWith("nitsyclaw-voice-") || name.startsWith("nitsyclaw-tts-"))
    .sort();
}

async function assertPrivateTempDir(path: string): Promise<void> {
  const actual = await realpath(path);
  const base = await realpath(tmpdir());
  const childPath = relative(base, actual);
  if (!childPath || childPath.startsWith("..") || isAbsolute(childPath) || !(await lstat(actual)).isDirectory()) {
    throw new Error("The V2 evaluation temp directory escaped its private root.");
  }
}

async function verifyLocalModels(): Promise<Array<{ id: string; size: number; sha256: string }>> {
  const userProfile = process.env.USERPROFILE ?? "";
  const appData = process.env.APPDATA ?? "";
  if (!isAbsolute(userProfile) || !isAbsolute(appData)) throw new Error("Local model roots are unavailable.");

  const nemotronSnapshot = join(
    userProfile,
    ".cache", "huggingface", "hub",
    "models--handy-computer--nemotron-3.5-asr-streaming-0.6b-gguf",
    "snapshots", "6d44e540bc31b0de1dbe174a3cea87f53a7f22fb",
    "nemotron-3.5-asr-streaming-0.6b-Q8_0.gguf",
  );
  const whisperPath = join(appData, "com.pais.handy", "models", "ggml-large-v3.bin");
  const nemotronRealPath = await realpath(nemotronSnapshot);
  const nemotronStat = await stat(nemotronRealPath);
  const whisperStat = await stat(whisperPath);
  if (!nemotronStat.isFile() || nemotronStat.size <= 0) throw new Error("The existing Nemotron model is unavailable.");
  if (!whisperStat.isFile() || whisperStat.size !== WHISPER_SIZE) throw new Error("The existing Whisper large-v3 size is invalid.");
  const whisperHash = await sha256File(whisperPath);
  if (whisperHash !== WHISPER_SHA256) throw new Error("The existing Whisper large-v3 hash is invalid.");
  return [
    { id: NEMOTRON_MODEL, size: nemotronStat.size, sha256: await sha256File(nemotronRealPath) },
    { id: WHISPER_MODEL, size: whisperStat.size, sha256: whisperHash },
  ];
}

async function main(): Promise<void> {
  const frozen = await verifyVoiceSmokeV2Freeze();
  const manifest = getVoiceSmokeV2Manifest();
  const localModels = await verifyLocalModels();
  const localAppData = process.env.LOCALAPPDATA ?? "";
  const ffmpeg = await reviewedExecutable(
    process.env.NITSYCLAW_FFMPEG_PATH?.trim() || join(localAppData, "Microsoft", "WinGet", "Links", "ffmpeg.exe"),
    "ffmpeg.exe",
  );
  const handy = await reviewedExecutable(
    process.env.NITSYCLAW_HANDY_PATH?.trim() || join(localAppData, "Handy", "handy.exe"),
    "handy.exe",
  );
  const before = await currentTempArtifacts();
  const evaluationDir = await mkdtemp(join(tmpdir(), "nitsyclaw-voice-v2-"));
  await assertPrivateTempDir(evaluationDir);
  const audioCorpus: Array<{ caseId: string; wavPath: string; sha256: string; size: number }> = [];
  const modelResults: Array<{
    model: string;
    cases: Array<ReturnType<typeof scoreVoiceSmokeV2>>;
  }> = [];

  try {
    const synthesizer = new LocalSapiSpeechSynthesizer();
    for (const testCase of manifest.cases) {
      const generated = await synthesizer.synthesize({
        text: testCase.reference,
        language: testCase.expectedLanguage as VoiceLanguage,
        correlationId: `v2-${testCase.id}`,
      });
      const oggPath = join(evaluationDir, `${testCase.id}.ogg`);
      const wavPath = join(evaluationDir, `${testCase.id}.wav`);
      await writeFile(oggPath, generated.audio, { flag: "wx" });
      await runBounded(ffmpeg, [
        "-v", "error", "-nostdin", "-protocol_whitelist", "file",
        "-max_alloc", String(64 * 1024 * 1024), "-threads", "1",
        "-i", oggPath, "-map", "0:a:0", "-vn", "-sn", "-dn",
        "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wavPath,
      ], 30_000);
      const wav = await readFile(wavPath);
      audioCorpus.push({ caseId: testCase.id, wavPath, sha256: createHash("sha256").update(wav).digest("hex"), size: wav.byteLength });
    }

    for (const model of [NEMOTRON_MODEL, WHISPER_MODEL]) {
      const cases: Array<ReturnType<typeof scoreVoiceSmokeV2>> = [];
      for (const audio of audioCorpus) {
        const result = await runBounded(handy, [
          "--transcribe-file", audio.wavPath,
          "--model", model,
          "--device-index", "0",
          "--json",
        ], PROCESS_TIMEOUT_MS);
        let parsed: { text?: unknown };
        try {
          parsed = JSON.parse(result.stdout) as { text?: unknown };
        } catch {
          throw new Error("Handy returned invalid JSON during the frozen V2 smoke.");
        }
        if (typeof parsed.text !== "string" || parsed.text.trim().length === 0) {
          throw new Error("Handy returned no transcript during the frozen V2 smoke.");
        }
        cases.push(scoreVoiceSmokeV2({
          caseId: audio.caseId,
          transcript: parsed.text.trim(),
          providerConfidence: null,
          latencyMs: result.elapsedMs,
        }));
      }
      modelResults.push({ model, cases });
    }
  } finally {
    await rm(evaluationDir, { recursive: true, force: true, maxRetries: 2 });
  }

  const after = await currentTempArtifacts();
  const cleanupPassed = JSON.stringify(before) === JSON.stringify(after);
  const passed = cleanupPassed && modelResults.every((model) => model.cases.every((testCase) => testCase.passed));
  console.log(JSON.stringify({
    evaluation: "NITSYCLAW-VOICE-SMOKE-V2",
    frozenAggregateSha256: frozen.aggregateSha256,
    offlineProcessEnvironment: true,
    kernelEnforcedNetworkIsolation: false,
    localModels,
    audioCorpus: audioCorpus.map((audio) => ({ caseId: audio.caseId, sha256: audio.sha256, size: audio.size })),
    models: modelResults,
    cleanupPassed,
    providerConfidenceLimitation: "Handy 0.9.4 exposes no calibrated probability in this path; null was preserved and external actions remain confirmation-gated.",
    passed,
  }, null, 2));
  if (!passed) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error("Frozen V2 voice smoke stopped without a verdict.", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
