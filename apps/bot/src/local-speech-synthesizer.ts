import { spawn } from "node:child_process";
import { lstat, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SpeechSynthesizer } from "@nitsyclaw/shared/agent";
import {
  containsUnsafeSpokenMaterial,
  normalizeTextForSpeech,
  type SpeechSynthesisRequest,
  type SpeechSynthesisResult,
} from "@nitsyclaw/shared/voice";

export class SpeechSynthesisError extends Error {
  constructor(
    readonly code: "unsupported_language" | "unsafe_text" | "tool_unavailable" | "synthesis_failed" | "invalid_output",
    message: string,
  ) {
    super(message);
    this.name = "SpeechSynthesisError";
  }
}

export interface LocalSpeechSynthesizerOptions {
  ffmpegPath?: string;
  ffprobePath?: string;
  powershellPath?: string;
  scriptPath?: string;
  tempRoot?: string;
  voice?: "Microsoft Ravi" | "Microsoft Heera" | "Microsoft David" | "Microsoft Zira";
}

export class LocalSapiSpeechSynthesizer implements SpeechSynthesizer {
  constructor(private readonly options: LocalSpeechSynthesizerOptions = {}) {}

  async synthesize(request: SpeechSynthesisRequest): Promise<SpeechSynthesisResult> {
    if (request.language === "hindi" || /[\u0900-\u097f]/u.test(request.text)) {
      throw new SpeechSynthesisError(
        "unsupported_language",
        "Hindi voice output needs an approved local Hindi model; no cloud fallback was used.",
      );
    }
    if (containsUnsafeSpokenMaterial(request.text)) {
      throw new SpeechSynthesisError("unsafe_text", "Sensitive-looking text is blocked from speech output.");
    }
    const spoken = normalizeTextForSpeech(request.text);
    const tools = await this.resolveTools();
    const tempBase = resolve(this.options.tempRoot ?? tmpdir());
    const tempDir = await mkdtemp(join(tempBase, "nitsyclaw-tts-"));
    const wavPath = join(tempDir, "speech.wav");
    const oggPath = join(tempDir, "reply.ogg");
    try {
      await assertPrivateTempDir(tempDir, tempBase);
      await runProcess(tools.powershell, [
        "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
        "-File", tools.script,
        "-OutputPath", wavPath,
        "-Voice", this.options.voice ?? "Microsoft Ravi",
      ], {
        timeoutMs: 30_000,
        stdin: spoken,
      });
      await runProcess(tools.ffmpeg, [
        "-v", "error", "-nostdin",
        "-protocol_whitelist", "file",
        "-max_alloc", String(64 * 1024 * 1024),
        "-threads", "1",
        "-i", wavPath,
        "-map", "0:a:0", "-map_metadata", "-1", "-map_chapters", "-1",
        "-vn", "-sn", "-dn", "-ac", "1", "-ar", "48000",
        "-c:a", "libopus", "-b:a", "32k", "-vbr", "on", "-application", "voip", "-frame_duration", "20",
        "-f", "ogg", "-y", oggPath,
      ], { timeoutMs: 30_000 });
      const probe = await runProcess(tools.ffprobe, [
        "-v", "error", "-protocol_whitelist", "file",
        "-show_entries", "format=format_name,duration,size:stream=codec_type,codec_name,channels,sample_rate",
        "-of", "json", oggPath,
      ], { timeoutMs: 10_000 });
      const durationSeconds = validateGeneratedProbe(probe.stdout);
      const audio = await readFile(oggPath);
      if (audio.byteLength === 0 || audio.byteLength > 2 * 1024 * 1024 || audio.toString("ascii", 0, 4) !== "OggS") {
        throw new SpeechSynthesisError("invalid_output", "Generated speech failed the binary output boundary.");
      }
      return {
        audio,
        mimetype: "audio/ogg; codecs=opus",
        filename: "nitsyclaw-reply.ogg",
        durationSeconds,
        language: request.language,
        engine: `windows-sapi:${this.options.voice ?? "Microsoft Ravi"}`,
      };
    } catch (error) {
      if (error instanceof SpeechSynthesisError) throw error;
      throw new SpeechSynthesisError("synthesis_failed", "Local speech generation failed before WhatsApp submission.");
    } finally {
      await removePrivateTempDir(tempDir, tempBase);
    }
  }

  private async resolveTools(): Promise<{ ffmpeg: string; ffprobe: string; powershell: string; script: string }> {
    const localAppData = process.env.LOCALAPPDATA ?? "";
    const ffmpeg = await executable(
      this.options.ffmpegPath ?? (process.env.NITSYCLAW_FFMPEG_PATH?.trim() || join(localAppData, "Microsoft", "WinGet", "Links", "ffmpeg.exe")),
      "ffmpeg.exe",
    );
    const ffprobe = await executable(
      this.options.ffprobePath ?? (process.env.NITSYCLAW_FFPROBE_PATH?.trim() || join(localAppData, "Microsoft", "WinGet", "Links", "ffprobe.exe")),
      "ffprobe.exe",
    );
    const powershell = await executable(
      this.options.powershellPath ?? "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
      "pwsh.exe",
    );
    const scriptCandidate = this.options.scriptPath ?? fileURLToPath(new URL("../../../scripts/synthesize-local-sapi.ps1", import.meta.url));
    const script = await realpath(scriptCandidate).catch(() => "");
    if (!script || basename(script).toLowerCase() !== "synthesize-local-sapi.ps1") {
      throw new SpeechSynthesisError("tool_unavailable", "The reviewed local speech script is unavailable.");
    }
    return { ffmpeg, ffprobe, powershell, script };
  }
}

async function executable(path: string, expectedName: string): Promise<string> {
  if (!path || !isAbsolute(path) || basename(path).toLowerCase() !== expectedName) {
    throw new SpeechSynthesisError("tool_unavailable", `${expectedName} is not configured safely.`);
  }
  try {
    const resolved = await realpath(path);
    if (!(await lstat(resolved)).isFile()) throw new Error("not file");
    return resolved;
  } catch {
    throw new SpeechSynthesisError("tool_unavailable", `${expectedName} is not available locally.`);
  }
}

function validateGeneratedProbe(stdout: string): number {
  let parsed: {
    format?: { format_name?: string; duration?: string; size?: string };
    streams?: Array<{ codec_type?: string; codec_name?: string; channels?: number; sample_rate?: string }>;
  };
  try {
    parsed = JSON.parse(stdout) as typeof parsed;
  } catch {
    throw new SpeechSynthesisError("invalid_output", "Generated speech metadata was invalid.");
  }
  const stream = parsed.streams?.[0];
  const duration = Number(parsed.format?.duration);
  const size = Number(parsed.format?.size);
  if (
    parsed.streams?.length !== 1 || stream?.codec_type !== "audio" || stream.codec_name !== "opus" ||
    stream.channels !== 1 || Number(stream.sample_rate) !== 48_000 || parsed.format?.format_name !== "ogg" ||
    !Number.isFinite(duration) || duration <= 0.1 || duration > 90 || !Number.isFinite(size) || size <= 0 || size > 2 * 1024 * 1024
  ) {
    throw new SpeechSynthesisError("invalid_output", "Generated speech did not meet the WhatsApp Opus voice-note contract.");
  }
  return duration;
}

function runProcess(
  executablePath: string,
  args: string[],
  options: { timeoutMs: number; stdin?: string },
): Promise<{ stdout: string }> {
  return new Promise((resolvePromise, reject) => {
    // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- resolveTools realpath-validates an absolute, allowlisted executable basename; arguments are fixed and shell is disabled.
    const child = spawn(executablePath, args, {
      shell: false,
      windowsHide: true,
      stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    let outputBytes = 0;
    let finished = false;
    const timer = setTimeout(() => fail(), options.timeoutMs);
    timer.unref?.();
    const fail = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.kill();
      reject(new Error("process failed"));
    };
    const collect = (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > 64 * 1024) return fail();
      stdout.push(Buffer.from(chunk));
    };
    child.stdout!.on("data", collect);
    child.stderr!.on("data", (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > 64 * 1024) fail();
    });
    child.once("error", fail);
    child.once("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (code !== 0) return reject(new Error("process failed"));
      resolvePromise({ stdout: Buffer.concat(stdout).toString("utf8") });
    });
    if (options.stdin !== undefined) {
      child.stdin!.end(options.stdin, "utf8");
    }
  });
}

async function assertPrivateTempDir(path: string, tempBase: string): Promise<void> {
  const actual = await realpath(path);
  const base = await realpath(tempBase);
  const childPath = relative(base, actual);
  if (!childPath || childPath.startsWith("..") || isAbsolute(childPath)) {
    throw new SpeechSynthesisError("tool_unavailable", "The speech temp path escaped its private root.");
  }
  const stat = await lstat(actual);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new SpeechSynthesisError("tool_unavailable", "The speech temp path is unsafe.");
}

async function removePrivateTempDir(path: string, tempBase: string): Promise<void> {
  const absolute = resolve(path);
  const base = resolve(tempBase);
  const childPath = relative(base, absolute);
  if (!childPath || childPath.startsWith("..") || isAbsolute(childPath)) return;
  await rm(absolute, { recursive: true, force: true, maxRetries: 2 });
}

export const localSpeechSynthesizerInternals = { validateGeneratedProbe };
