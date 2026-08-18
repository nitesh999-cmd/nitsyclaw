import { describe, expect, it } from "vitest";
import {
  LocalVoiceTranscriber,
  localVoiceTranscriberInternals,
  VoicePipelineError,
  VOICE_MEDIA_LIMITS,
} from "./local-voice-transcriber.js";

function pcmWav(samples: number[], sampleRate = 16_000, channels = 1, bits = 16): Buffer {
  const bytesPerSample = bits / 8;
  const dataBytes = samples.length * bytesPerSample;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  wav.writeUInt16LE(channels * bytesPerSample, 32);
  wav.writeUInt16LE(bits, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(dataBytes, 40);
  samples.forEach((sample, index) => wav.writeInt16LE(sample, 44 + index * 2));
  return wav;
}

describe("local voice binary boundary", () => {
  it("measures a valid 16 kHz mono PCM WAV without trusting metadata", () => {
    const samples = Array.from({ length: 16_000 }, (_, index) => Math.round(Math.sin(index / 10) * 8_000));
    const facts = localVoiceTranscriberInternals.inspectPcmWav(pcmWav(samples));
    expect(facts.durationSeconds).toBe(1);
    expect(facts.peak).toBeGreaterThan(0.2);
    expect(facts.rmsDb).toBeGreaterThan(-20);
  });

  it("detects silence and rejects malformed or extreme PCM shapes", () => {
    const silent = localVoiceTranscriberInternals.inspectPcmWav(pcmWav(new Array(1_600).fill(0)));
    expect(silent.rmsDb).toBe(-Infinity);
    expect(silent.peak).toBe(0);
    expect(() => localVoiceTranscriberInternals.inspectPcmWav(Buffer.from("RIFFbad"))).toThrow(VoicePipelineError);
    expect(() => localVoiceTranscriberInternals.inspectPcmWav(pcmWav([1, 2], 192_000))).toThrow(/16 kHz/);
    expect(() => localVoiceTranscriberInternals.inspectPcmWav(pcmWav([1, 2, 3, 4], 16_000, 2))).toThrow(/16 kHz mono/);
  });

  it.each([
    [Buffer.from("OggSvoice"), true],
    [Buffer.from("RIFF0000WAVE"), true],
    [Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2]), true],
    [Buffer.from("0000ftypisom"), true],
    [Buffer.from([0xff, 0xfb, 0x90, 0x64]), true],
    [Buffer.from("not audio"), false],
    [Buffer.alloc(0), false],
  ])("validates container magic before decoding", (input, valid) => {
    if (valid) expect(() => localVoiceTranscriberInternals.validateMagic(input)).not.toThrow();
    else expect(() => localVoiceTranscriberInternals.validateMagic(input)).toThrow(/signature/);
  });

  it("rejects MIME/container/codec spoofing and unsupported codecs", () => {
    expect(() => localVoiceTranscriberInternals.assertMimeMatches("audio/ogg; codecs=opus", "ogg", "opus")).not.toThrow();
    expect(() => localVoiceTranscriberInternals.assertMimeMatches("audio/ogg", "mp3", "mp3")).toThrow(/claimed audio type/);
    expect(() => localVoiceTranscriberInternals.mapCodec("flac")).toThrow(/codec/);
    expect(() => localVoiceTranscriberInternals.mapContainer("image2")).toThrow(/container/);
  });

  it("enforces bounded ASR deadlines at both short and maximum duration", () => {
    expect(localVoiceTranscriberInternals.transcriptionDeadlineMs(1)).toBe(45_000);
    expect(localVoiceTranscriberInternals.transcriptionDeadlineMs(180)).toBe(600_000);
    expect(localVoiceTranscriberInternals.transcriptionDeadlineMs(10_000)).toBe(600_000);
  });

  it("rejects one unit beyond each declared media boundary before any local tool runs", async () => {
    const transcriber = new LocalVoiceTranscriber();
    await expect(transcriber.transcribe(Buffer.alloc(VOICE_MEDIA_LIMITS.maxEncodedBytes + 1), "audio/ogg"))
      .rejects.toMatchObject({ code: "media_too_large" });
    await expect(transcriber.transcribe(Buffer.from("OggSvoice"), "audio/ogg", {
      declaredDurationSeconds: VOICE_MEDIA_LIMITS.maxDurationSeconds + 1,
    })).rejects.toMatchObject({ code: "duration_too_long" });
  });

  it("rejects false provider size and malformed duration declarations before decoding", async () => {
    const transcriber = new LocalVoiceTranscriber();
    const audio = Buffer.from("OggSvoice");
    await expect(transcriber.transcribe(audio, "audio/ogg", { declaredSizeBytes: audio.length + 1 }))
      .rejects.toMatchObject({ code: "invalid_container" });
    await expect(transcriber.transcribe(audio, "audio/ogg", { declaredDurationSeconds: 0 }))
      .rejects.toMatchObject({ code: "invalid_container" });
  });
});
