import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { LocalSapiSpeechSynthesizer } from "../apps/bot/src/local-speech-synthesizer.js";
import { LocalVoiceTranscriber } from "../apps/bot/src/local-voice-transcriber.js";
import type { VoiceLanguage } from "@nitsyclaw/shared/voice";

const THRESHOLDS = Object.freeze({
  englishWerMax: 0.2,
  hinglishWerMax: 0.4,
  criticalEntityAccuracyMin: 1,
  languageAccuracyMin: 1,
  clipLatencyMsMax: 45_000,
});

const CASES: ReadonlyArray<{
  id: string;
  text: string;
  language: VoiceLanguage;
  entities: string[];
}> = [
  {
    id: "english-solar-au",
    text: "Please call Raj Sharma in Melbourne tomorrow at three thirty P M about the ten kilowatt Fronius solar inverter.",
    language: "english",
    entities: ["raj", "sharma", "melbourne", "three", "thirty", "ten", "kilowatt", "fronius"],
  },
  {
    id: "hinglish-business",
    text: "Kal subah Ravi ko Sydney mein call karna aur Tesla Powerwall three ka quote fifteen percent discount ke saath check karna.",
    language: "hinglish",
    entities: ["ravi", "sydney", "tesla", "powerwall", "three", "fifteen", "percent"],
  },
] as const;

async function tempArtifacts(): Promise<string[]> {
  return (await readdir(tmpdir()))
    .filter((name) => name.startsWith("nitsyclaw-voice-") || name.startsWith("nitsyclaw-tts-"))
    .sort();
}

function normalizedWords(value: string): string[] {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
}

function editDistance(expected: string[], actual: string[]): number {
  const previous = Array.from({ length: actual.length + 1 }, (_, index) => index);
  for (let row = 1; row <= expected.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= actual.length; column += 1) {
      current[column] = Math.min(
        current[column - 1]! + 1,
        previous[column]! + 1,
        previous[column - 1]! + (expected[row - 1] === actual[column - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[actual.length] ?? expected.length;
}

function wordErrorRate(expected: string, actual: string): number {
  const reference = normalizedWords(expected);
  return reference.length === 0 ? 0 : editDistance(reference, normalizedWords(actual)) / reference.length;
}

function entityAccuracy(entities: string[], actual: string): number {
  const words = new Set(normalizedWords(actual));
  return entities.filter((entity) => words.has(entity)).length / entities.length;
}

async function main(): Promise<void> {
  const before = await tempArtifacts();
  const synthesizer = new LocalSapiSpeechSynthesizer();
  const transcriber = new LocalVoiceTranscriber();
  const results = [];

  for (const testCase of CASES) {
    const started = performance.now();
    const generated = await synthesizer.synthesize({
      text: testCase.text,
      language: testCase.language,
      correlationId: `eval-${testCase.id}`,
    });
    const transcription = await transcriber.transcribe(generated.audio, generated.mimetype, {
      declaredSizeBytes: generated.audio.byteLength,
      declaredDurationSeconds: generated.durationSeconds,
      correlationId: `eval-${testCase.id}`,
    });
    const latencyMs = Math.round(performance.now() - started);
    results.push({
      id: testCase.id,
      expectedLanguage: testCase.language,
      detectedLanguage: transcription.language,
      wordErrorRate: Number(wordErrorRate(testCase.text, transcription.text).toFixed(3)),
      criticalEntityAccuracy: Number(entityAccuracy(testCase.entities, transcription.text).toFixed(3)),
      latencyMs,
      providerConfidence: transcription.providerConfidence,
      quality: transcription.quality,
    });
  }

  const after = await tempArtifacts();
  const cleanupPassed = JSON.stringify(after) === JSON.stringify(before);
  const english = results.find((result) => result.id === "english-solar-au")!;
  const hinglish = results.find((result) => result.id === "hinglish-business")!;
  const languageAccuracy = results.filter((result) => result.detectedLanguage === result.expectedLanguage).length / results.length;
  const passed =
    english.wordErrorRate <= THRESHOLDS.englishWerMax &&
    hinglish.wordErrorRate <= THRESHOLDS.hinglishWerMax &&
    results.every((result) => result.criticalEntityAccuracy >= THRESHOLDS.criticalEntityAccuracyMin) &&
    results.every((result) => result.latencyMs <= THRESHOLDS.clipLatencyMsMax) &&
    languageAccuracy >= THRESHOLDS.languageAccuracyMin &&
    cleanupPassed;

  console.log(JSON.stringify({
    evaluation: "private licence-safe synthetic SAPI-to-local-ASR",
    thresholds: THRESHOLDS,
    results,
    languageAccuracy,
    cleanupPassed,
    hindiAcousticEvaluation: "not_run_no_approved_local_hindi_tts_or_recording",
    passed,
  }, null, 2));
  if (!passed) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error("Local voice evaluation failed before a verdict.", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
