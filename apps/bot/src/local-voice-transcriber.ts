import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import type { Transcriber } from "@nitsyclaw/shared/agent";
import {
  assessTranscriptionQuality,
  detectVoiceLanguage,
  type TranscriptionRequestOptions,
  type TranscriptionResult,
  type VoiceMediaFacts,
} from "@nitsyclaw/shared/voice";

export const VOICE_MEDIA_LIMITS = {
  maxEncodedBytes: 8 * 1024 * 1024,
  maxDurationSeconds: 180,
  minSampleRate: 8_000,
  maxSampleRate: 96_000,
  maxChannels: 2,
  probeTimeoutMs: 10_000,
  decodeTimeoutMs: 30_000,
  maxProcessOutputBytes: 128 * 1024,
  maxPendingJobs: 4,
} as const;

const DEFAULT_HANDY_MODEL = "handy-computer/nemotron-3.5-asr-streaming-0.6b-gguf/nemotron-3.5-asr-streaming-0.6b-Q8_0.gguf";
const ALLOWED_HANDY_MODELS = new Set([
  DEFAULT_HANDY_MODEL,
  "handy-computer/parakeet-unified-en-0.6b-gguf/parakeet-unified-en-0.6b-Q8_0.gguf",
]);

type SupportedContainer = VoiceMediaFacts["container"];
type SupportedCodec = VoiceMediaFacts["codec"];

export class VoicePipelineError extends Error {
  constructor(
    readonly code:
      | "media_too_large"
      | "duration_too_long"
      | "unsupported_mime"
      | "mime_spoof"
      | "invalid_container"
      | "unsupported_codec"
      | "invalid_audio_shape"
      | "decode_failed"
      | "silent_audio"
      | "transcription_timeout"
      | "transcription_failed"
      | "transcription_empty"
      | "queue_full"
      | "local_tool_unavailable",
    message: string,
  ) {
    super(message);
    this.name = "VoicePipelineError";
  }
}

export interface LocalVoiceTranscriberOptions {
  ffmpegPath?: string;
  ffprobePath?: string;
  handyPath?: string;
  handyModel?: string;
  handyDeviceIndex?: number;
  tempRoot?: string;
  now?: () => number;
}

export class LocalVoiceTranscriber implements Transcriber {
  private tail: Promise<void> = Promise.resolve();
  private pending = 0;

  constructor(private readonly options: LocalVoiceTranscriberOptions = {}) {}

  async transcribe(
    audio: Buffer,
    mimetype: string,
    options: TranscriptionRequestOptions = {},
  ): Promise<TranscriptionResult> {
    if (this.pending >= VOICE_MEDIA_LIMITS.maxPendingJobs) {
      throw new VoicePipelineError("queue_full", "The local voice queue is full. Please retry after the current notes finish.");
    }
    this.pending += 1;
    const run = this.tail.then(() => this.transcribeNow(audio, mimetype, options));
    this.tail = run.then(() => undefined, () => undefined);
    try {
      return await run;
    } finally {
      this.pending -= 1;
    }
  }

  state(): { activeOrPending: number; maxPending: number } {
    return { activeOrPending: this.pending, maxPending: VOICE_MEDIA_LIMITS.maxPendingJobs };
  }

  private async transcribeNow(
    audio: Buffer,
    mimetype: string,
    options: TranscriptionRequestOptions,
  ): Promise<TranscriptionResult> {
    const startedAt = this.now();
    const correlation = safeCorrelation(options.correlationId);
    validateDeclaredMedia(audio, mimetype, options);
    const tools = await resolveTools(this.options);
    const tempBase = resolve(this.options.tempRoot ?? tmpdir());
    const tempDir = await mkdtemp(join(tempBase, "nitsyclaw-voice-"));
    const inputPath = join(tempDir, "input.media");
    const wavPath = join(tempDir, "decoded.wav");

    try {
      await assertPrivateTempDir(tempDir, tempBase);
      await writeFile(inputPath, audio, { flag: "wx", mode: 0o600 });
      const probeStarted = this.now();
      const probed = await probeAudio(tools.ffprobe, inputPath, mimetype, audio.byteLength);
      if (
        options.declaredDurationSeconds !== undefined &&
        Math.abs(options.declaredDurationSeconds - probed.durationSeconds) > Math.max(1.5, probed.durationSeconds * 0.05)
      ) {
        throw new VoicePipelineError("invalid_container", "The recording duration did not match the provider declaration.");
      }
      const probeMs = this.now() - probeStarted;
      if (probed.durationSeconds > 45) await safeProgress(options, "validated");

      const decodeStarted = this.now();
      await decodeAudio(tools.ffmpeg, inputPath, wavPath);
      const decoded = inspectPcmWav(await readFile(wavPath));
      const decodeMs = this.now() - decodeStarted;
      if (Math.abs(decoded.durationSeconds - probed.durationSeconds) > Math.max(1.5, probed.durationSeconds * 0.05)) {
        throw new VoicePipelineError("decode_failed", "Decoded duration did not match the validated media duration.");
      }
      const media: VoiceMediaFacts = {
        ...probed,
        durationSeconds: decoded.durationSeconds,
        rmsDb: decoded.rmsDb,
        peak: decoded.peak,
      };
      if (media.rmsDb < -55 || media.peak < 0.004) {
        throw new VoicePipelineError("silent_audio", "That recording appears silent. Please send a new voice note closer to the microphone.");
      }

      await safeProgress(options, "transcribing");
      console.log(`[voice] ref=${correlation} stage=transcribing durationMs=${Math.round(media.durationSeconds * 1_000)}`);
      const transcribeStarted = this.now();
      const handy = await runHandy(tools.handy, wavPath, {
        model: tools.model,
        deviceIndex: tools.deviceIndex,
        timeoutMs: transcriptionDeadlineMs(media.durationSeconds),
        outputLimitBytes: VOICE_MEDIA_LIMITS.maxProcessOutputBytes,
      });
      const transcribeMs = this.now() - transcribeStarted;
      const text = normalizeTranscript(handy.text);
      if (!text) throw new VoicePipelineError("transcription_empty", "I could not hear understandable speech in that recording.");
      const language = detectVoiceLanguage(text);
      const quality = assessTranscriptionQuality({ text, media, providerConfidence: null });
      console.log(`[voice] ref=${correlation} stage=transcribed quality=${quality.quality} language=${language.language}`);
      return {
        text,
        language: language.language,
        languageConfidence: language.confidence,
        providerConfidence: null,
        quality: quality.quality,
        uncertainSpans: [],
        media,
        timingsMs: {
          probe: probeMs,
          decode: decodeMs,
          transcribe: transcribeMs,
          total: this.now() - startedAt,
        },
      };
    } finally {
      await removePrivateTempDir(tempDir, tempBase);
    }
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}

function validateDeclaredMedia(
  audio: Buffer,
  mimetype: string,
  options: TranscriptionRequestOptions,
): void {
  if (audio.byteLength === 0) throw new VoicePipelineError("invalid_container", "The voice note was empty.");
  if (audio.byteLength > VOICE_MEDIA_LIMITS.maxEncodedBytes) {
    throw new VoicePipelineError("media_too_large", "That voice note is larger than the 8 MB local safety limit.");
  }
  if (options.declaredSizeBytes !== undefined) {
    if (!Number.isInteger(options.declaredSizeBytes) || options.declaredSizeBytes < 0) {
      throw new VoicePipelineError("invalid_container", "WhatsApp reported an invalid voice-note size.");
    }
    if (options.declaredSizeBytes > VOICE_MEDIA_LIMITS.maxEncodedBytes) {
      throw new VoicePipelineError("media_too_large", "WhatsApp reported a voice note larger than the 8 MB local safety limit.");
    }
    if (options.declaredSizeBytes !== audio.byteLength) {
      throw new VoicePipelineError("invalid_container", "The downloaded voice-note size did not match the provider declaration.");
    }
  }
  if (options.declaredDurationSeconds !== undefined) {
    if (!Number.isFinite(options.declaredDurationSeconds) || options.declaredDurationSeconds <= 0) {
      throw new VoicePipelineError("invalid_container", "WhatsApp reported an invalid voice-note duration.");
    }
    if (options.declaredDurationSeconds > VOICE_MEDIA_LIMITS.maxDurationSeconds) {
      throw new VoicePipelineError("duration_too_long", "That voice note is longer than the 3 minute local limit.");
    }
  }
  canonicalMime(mimetype);
  validateMagic(audio);
}

async function resolveTools(options: LocalVoiceTranscriberOptions): Promise<{
  ffmpeg: string;
  ffprobe: string;
  handy: string;
  model: string;
  deviceIndex: number;
}> {
  const localAppData = process.env.LOCALAPPDATA ?? "";
  const ffmpeg = await resolveExecutable(
    options.ffmpegPath ?? (process.env.NITSYCLAW_FFMPEG_PATH?.trim() || join(localAppData, "Microsoft", "WinGet", "Links", "ffmpeg.exe")),
    "ffmpeg.exe",
  );
  const ffprobe = await resolveExecutable(
    options.ffprobePath ?? (process.env.NITSYCLAW_FFPROBE_PATH?.trim() || join(localAppData, "Microsoft", "WinGet", "Links", "ffprobe.exe")),
    "ffprobe.exe",
  );
  const handy = await resolveExecutable(
    options.handyPath ?? (process.env.NITSYCLAW_HANDY_PATH?.trim() || join(localAppData, "Handy", "handy.exe")),
    "handy.exe",
  );
  const model = options.handyModel ?? (process.env.NITSYCLAW_HANDY_MODEL?.trim() || DEFAULT_HANDY_MODEL);
  if (!ALLOWED_HANDY_MODELS.has(model)) {
    throw new VoicePipelineError("local_tool_unavailable", "The configured local speech model is not on the reviewed allowlist.");
  }
  const deviceIndex = options.handyDeviceIndex ?? Number(process.env.NITSYCLAW_HANDY_DEVICE_INDEX ?? "0");
  if (!Number.isInteger(deviceIndex) || deviceIndex < 0 || deviceIndex > 16) {
    throw new VoicePipelineError("local_tool_unavailable", "The configured local speech device index is invalid.");
  }
  return { ffmpeg, ffprobe, handy, model, deviceIndex };
}

async function resolveExecutable(path: string, expectedName: string): Promise<string> {
  if (!path || !isAbsolute(path) || basename(path).toLowerCase() !== expectedName) {
    throw new VoicePipelineError("local_tool_unavailable", `${expectedName} is not configured as an absolute reviewed executable path.`);
  }
  try {
    const resolved = await realpath(path);
    const stat = await lstat(resolved);
    if (!stat.isFile()) throw new Error("not a file");
    return resolved;
  } catch {
    throw new VoicePipelineError("local_tool_unavailable", `${expectedName} is not available on this owner machine.`);
  }
}

async function probeAudio(
  ffprobe: string,
  inputPath: string,
  mimetype: string,
  actualBytes: number,
): Promise<Omit<VoiceMediaFacts, "rmsDb" | "peak">> {
  const output = await runProcess(ffprobe, [
    "-v", "error",
    "-protocol_whitelist", "file",
    "-show_entries", "format=format_name,duration,size:stream=index,codec_type,codec_name,channels,sample_rate,duration",
    "-of", "json",
    inputPath,
  ], {
    timeoutMs: VOICE_MEDIA_LIMITS.probeTimeoutMs,
    outputLimitBytes: VOICE_MEDIA_LIMITS.maxProcessOutputBytes,
  }).catch(() => {
    throw new VoicePipelineError("invalid_container", "The recording container is corrupt or unsupported.");
  });
  let parsed: {
    format?: { format_name?: string; duration?: string; size?: string };
    streams?: Array<{ codec_type?: string; codec_name?: string; channels?: number; sample_rate?: string; duration?: string }>;
  };
  try {
    parsed = JSON.parse(output.stdout) as typeof parsed;
  } catch {
    throw new VoicePipelineError("invalid_container", "The recording metadata could not be validated.");
  }
  const streams = parsed.streams ?? [];
  if (streams.length !== 1 || streams[0]?.codec_type !== "audio") {
    throw new VoicePipelineError("invalid_container", "Voice notes must contain exactly one audio stream and no hidden attachments.");
  }
  const stream = streams[0]!;
  const container = mapContainer(parsed.format?.format_name);
  const codec = mapCodec(stream.codec_name);
  const durationSeconds = finitePositive(parsed.format?.duration ?? stream.duration);
  const channels = Number(stream.channels);
  const sampleRate = Number(stream.sample_rate);
  const probedBytes = Number(parsed.format?.size);
  if (!durationSeconds || durationSeconds > VOICE_MEDIA_LIMITS.maxDurationSeconds) {
    throw new VoicePipelineError("duration_too_long", "Voice notes must be between audible speech and 3 minutes long.");
  }
  if (!Number.isInteger(channels) || channels < 1 || channels > VOICE_MEDIA_LIMITS.maxChannels) {
    throw new VoicePipelineError("invalid_audio_shape", "The recording channel count is outside the safe limit.");
  }
  if (!Number.isInteger(sampleRate) || sampleRate < VOICE_MEDIA_LIMITS.minSampleRate || sampleRate > VOICE_MEDIA_LIMITS.maxSampleRate) {
    throw new VoicePipelineError("invalid_audio_shape", "The recording sample rate is outside the safe limit.");
  }
  if (Number.isFinite(probedBytes) && probedBytes !== actualBytes) {
    throw new VoicePipelineError("invalid_container", "The recording size did not match its container metadata.");
  }
  assertMimeMatches(mimetype, container, codec);
  return { container, codec, bytes: actualBytes, durationSeconds, channels, sampleRate };
}

async function decodeAudio(ffmpeg: string, inputPath: string, wavPath: string): Promise<void> {
  await runProcess(ffmpeg, [
    "-v", "error",
    "-nostdin",
    "-protocol_whitelist", "file",
    "-max_alloc", String(64 * 1024 * 1024),
    "-threads", "1",
    "-i", inputPath,
    "-map", "0:a:0",
    "-map_metadata", "-1",
    "-map_chapters", "-1",
    "-vn", "-sn", "-dn",
    "-ac", "1",
    "-ar", "16000",
    "-c:a", "pcm_s16le",
    "-f", "wav",
    "-y",
    wavPath,
  ], {
    timeoutMs: VOICE_MEDIA_LIMITS.decodeTimeoutMs,
    outputLimitBytes: VOICE_MEDIA_LIMITS.maxProcessOutputBytes,
  }).catch(() => {
    throw new VoicePipelineError("decode_failed", "The voice note could not be decoded safely.");
  });
}

function inspectPcmWav(wav: Buffer): { durationSeconds: number; rmsDb: number; peak: number } {
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new VoicePipelineError("decode_failed", "The local decoder did not produce a valid WAV file.");
  }
  let offset = 12;
  let format: { audioFormat: number; channels: number; sampleRate: number; bits: number } | undefined;
  let data: Buffer | undefined;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > wav.length) throw new VoicePipelineError("decode_failed", "The decoded WAV was truncated.");
    if (id === "fmt " && size >= 16) {
      format = {
        audioFormat: wav.readUInt16LE(start),
        channels: wav.readUInt16LE(start + 2),
        sampleRate: wav.readUInt32LE(start + 4),
        bits: wav.readUInt16LE(start + 14),
      };
    } else if (id === "data") {
      data = wav.subarray(start, end);
    }
    offset = end + (size % 2);
  }
  if (!format || format.audioFormat !== 1 || format.channels !== 1 || format.sampleRate !== 16_000 || format.bits !== 16 || !data) {
    throw new VoicePipelineError("decode_failed", "The decoded WAV did not meet the 16 kHz mono PCM contract.");
  }
  if (data.length < 2 || data.length % 2 !== 0) throw new VoicePipelineError("decode_failed", "The decoded PCM payload was invalid.");
  let sumSquares = 0;
  let peak = 0;
  const samples = data.length / 2;
  for (let i = 0; i < data.length; i += 2) {
    const normalized = data.readInt16LE(i) / 32768;
    sumSquares += normalized * normalized;
    peak = Math.max(peak, Math.abs(normalized));
  }
  const rms = Math.sqrt(sumSquares / samples);
  return {
    durationSeconds: samples / 16_000,
    rmsDb: rms > 0 ? 20 * Math.log10(rms) : -Infinity,
    peak,
  };
}

async function runHandy(
  handy: string,
  wavPath: string,
  options: { model: string; deviceIndex: number; timeoutMs: number; outputLimitBytes: number },
): Promise<{ text: string }> {
  let output: ProcessOutput;
  try {
    output = await runProcess(handy, [
      "--transcribe-file", wavPath,
      "--model", options.model,
      "--device-index", String(options.deviceIndex),
      "--json",
    ], {
      timeoutMs: options.timeoutMs,
      outputLimitBytes: options.outputLimitBytes,
      env: { ...process.env, RUST_LOG: "error", NO_COLOR: "1" },
    });
  } catch (error) {
    if (error instanceof ProcessRunError && error.code === "timeout") {
      throw new VoicePipelineError("transcription_timeout", "Local transcription exceeded its bounded deadline.");
    }
    throw new VoicePipelineError("transcription_failed", "The local transcription engine failed.");
  }
  try {
    const parsed = JSON.parse(output.stdout) as { text?: unknown };
    return { text: typeof parsed.text === "string" ? parsed.text : "" };
  } catch {
    throw new VoicePipelineError("transcription_failed", "The local transcription engine returned an invalid result.");
  }
}

interface ProcessOutput { stdout: string; stderr: string }

class ProcessRunError extends Error {
  constructor(readonly code: "timeout" | "output_limit" | "exit") {
    super(code);
  }
}

function runProcess(
  executable: string,
  args: string[],
  options: { timeoutMs: number; outputLimitBytes: number; env?: NodeJS.ProcessEnv },
): Promise<ProcessOutput> {
  return new Promise((resolvePromise, reject) => {
    // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- resolveTools realpath-validates an absolute, allowlisted executable basename; arguments are fixed and shell is disabled.
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: options.env,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let finished = false;
    let timer: NodeJS.Timeout | undefined;
    const fail = (error: Error) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      child.kill();
      reject(error);
    };
    const collect = (target: Buffer[], chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > options.outputLimitBytes) {
        fail(new ProcessRunError("output_limit"));
        return;
      }
      target.push(Buffer.from(chunk));
    };
    child.stdout.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk));
    child.once("error", () => fail(new ProcessRunError("exit")));
    child.once("close", (code) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      if (code !== 0) {
        reject(new ProcessRunError("exit"));
        return;
      }
      resolvePromise({ stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
    });
    timer = setTimeout(() => fail(new ProcessRunError("timeout")), options.timeoutMs);
    timer.unref?.();
  });
}

function canonicalMime(mimetype: string): string {
  const mime = mimetype.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const allowed = new Set([
    "audio/ogg", "audio/opus", "audio/webm", "audio/mpeg", "audio/mp3",
    "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav",
  ]);
  if (!allowed.has(mime)) throw new VoicePipelineError("unsupported_mime", "That audio type is not supported for local transcription.");
  return mime;
}

function validateMagic(audio: Buffer): void {
  const ogg = audio.length >= 4 && audio.toString("ascii", 0, 4) === "OggS";
  const wav = audio.length >= 12 && audio.toString("ascii", 0, 4) === "RIFF" && audio.toString("ascii", 8, 12) === "WAVE";
  const webm = audio.length >= 4 && audio.readUInt32BE(0) === 0x1a45dfa3;
  const mp4 = audio.length >= 12 && audio.toString("ascii", 4, 8) === "ftyp";
  const mp3 = audio.length >= 3 && audio.toString("ascii", 0, 3) === "ID3" ||
    audio.length >= 2 && audio[0] === 0xff && (audio[1]! & 0xe0) === 0xe0;
  if (!ogg && !wav && !webm && !mp4 && !mp3) {
    throw new VoicePipelineError("invalid_container", "The recording signature did not match a supported audio container.");
  }
}

function mapContainer(value: string | undefined): SupportedContainer {
  const names = new Set((value ?? "").split(","));
  if (names.has("ogg")) return "ogg";
  if (names.has("webm") || names.has("matroska")) return "webm";
  if (names.has("mov") || names.has("mp4") || names.has("m4a")) return "mp4";
  if (names.has("mp3")) return "mp3";
  if (names.has("wav")) return "wav";
  throw new VoicePipelineError("invalid_container", "The probed audio container is not on the allowlist.");
}

function mapCodec(value: string | undefined): SupportedCodec {
  if (value === "opus") return "opus";
  if (value === "aac") return "aac";
  if (value === "mp3") return "mp3";
  if (value?.startsWith("pcm_")) return "pcm";
  throw new VoicePipelineError("unsupported_codec", "The audio codec is not supported.");
}

function assertMimeMatches(mimetype: string, container: SupportedContainer, codec: SupportedCodec): void {
  const mime = canonicalMime(mimetype);
  const valid =
    ((mime === "audio/ogg" || mime === "audio/opus") && container === "ogg" && codec === "opus") ||
    (mime === "audio/webm" && container === "webm" && codec === "opus") ||
    ((mime === "audio/mpeg" || mime === "audio/mp3") && container === "mp3" && codec === "mp3") ||
    ((mime === "audio/mp4" || mime === "audio/x-m4a") && container === "mp4" && codec === "aac") ||
    ((mime === "audio/wav" || mime === "audio/x-wav") && container === "wav" && codec === "pcm");
  if (!valid) throw new VoicePipelineError("mime_spoof", "The claimed audio type did not match its container and codec.");
}

function finitePositive(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function transcriptionDeadlineMs(durationSeconds: number): number {
  return Math.min(600_000, Math.max(45_000, Math.ceil(durationSeconds * 3_500)));
}

function normalizeTranscript(text: string): string {
  return text.normalize("NFKC").replace(/\r\n/g, "\n").trim().slice(0, 12_000);
}

async function assertPrivateTempDir(path: string, tempBase: string): Promise<void> {
  const actual = await realpath(path);
  const base = await realpath(tempBase);
  const childPath = relative(base, actual);
  if (!childPath || childPath.startsWith("..") || isAbsolute(childPath)) {
    throw new VoicePipelineError("local_tool_unavailable", "The private voice temp directory escaped the configured temp root.");
  }
  const stat = await lstat(actual);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new VoicePipelineError("local_tool_unavailable", "The private voice temp path is unsafe.");
  }
}

async function removePrivateTempDir(path: string, tempBase: string): Promise<void> {
  const absolute = resolve(path);
  const base = resolve(tempBase);
  const childPath = relative(base, absolute);
  if (!childPath || childPath.startsWith("..") || isAbsolute(childPath)) return;
  await rm(absolute, { recursive: true, force: true, maxRetries: 2 });
}

async function safeProgress(options: TranscriptionRequestOptions, stage: "validated" | "transcribing"): Promise<void> {
  try {
    await options.onProgress?.(stage);
  } catch {
    // Progress delivery is optional and must never abort a validated local job.
  }
}

function safeCorrelation(value: string | undefined): string {
  if (value && /^[a-z0-9_-]{6,64}$/i.test(value)) return value;
  return createHash("sha256").update(value ?? "voice").digest("hex").slice(0, 12);
}

export const localVoiceTranscriberInternals = {
  inspectPcmWav,
  validateMagic,
  mapContainer,
  mapCodec,
  assertMimeMatches,
  transcriptionDeadlineMs,
};
