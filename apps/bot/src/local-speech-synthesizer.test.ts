import { describe, expect, it } from "vitest";
import { localSpeechSynthesizerInternals, LocalSapiSpeechSynthesizer } from "./local-speech-synthesizer.js";

describe("local speech synthesis boundary", () => {
  it("accepts only one mono 48 kHz Opus stream in Ogg", () => {
    const valid = JSON.stringify({
      format: { format_name: "ogg", duration: "3.2", size: "12000" },
      streams: [{ codec_type: "audio", codec_name: "opus", channels: 1, sample_rate: "48000" }],
    });
    expect(localSpeechSynthesizerInternals.validateGeneratedProbe(valid)).toBe(3.2);
  });

  it.each([
    { format: { format_name: "mp3", duration: "2", size: "10" }, streams: [{ codec_type: "audio", codec_name: "mp3", channels: 1, sample_rate: "48000" }] },
    { format: { format_name: "ogg", duration: "2", size: "10" }, streams: [{ codec_type: "audio", codec_name: "opus", channels: 8, sample_rate: "48000" }] },
    { format: { format_name: "ogg", duration: "91", size: "10" }, streams: [{ codec_type: "audio", codec_name: "opus", channels: 1, sample_rate: "48000" }] },
    { format: { format_name: "ogg", duration: "2", size: "10" }, streams: [{ codec_type: "audio", codec_name: "opus", channels: 1, sample_rate: "48000" }, { codec_type: "data" }] },
  ])("rejects invalid generated media", (probe) => {
    expect(() => localSpeechSynthesizerInternals.validateGeneratedProbe(JSON.stringify(probe))).toThrow(/contract/);
  });

  it("fails closed for Hindi because no approved local Hindi TTS model is installed", async () => {
    const synth = new LocalSapiSpeechSynthesizer();
    await expect(synth.synthesize({ text: "नमस्ते", language: "hindi" })).rejects.toMatchObject({
      code: "unsupported_language",
    });
  });
});
