import { performance } from "node:perf_hooks";
import fixtures from "./voice-verifier-v1-fixtures.json";
import {
  verifyVoiceTranscript,
  type VerifiedVoiceContact,
  type VerifiedVoiceProduct,
  type VoiceLanguage,
  type VoiceSemanticEvidence,
} from "../../packages/shared/src/voice/index.js";
import { verifyVoiceVerifierV1Freeze } from "./verify-voice-verifier-v1-freeze.js";

type BenchmarkCase = {
  ownerHash: string;
  transcript: string;
  semantic?: VoiceSemanticEvidence;
};

function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function languageFor(text: string): VoiceLanguage {
  return /[\u0900-\u097f]/u.test(text) ? "hinglish" : "english";
}

async function main(): Promise<void> {
  const frozen = await verifyVoiceVerifierV1Freeze();
  const contacts = fixtures.contacts.map((contact) => ({
    ...contact,
    channel: contact.channel as VerifiedVoiceContact["channel"],
  })) satisfies VerifiedVoiceContact[];
  const products = fixtures.products satisfies VerifiedVoiceProduct[];
  const cases = fixtures.cases as BenchmarkCase[];

  const runCase = (benchmarkCase: BenchmarkCase) => verifyVoiceTranscript({
    rawTranscript: benchmarkCase.transcript,
    ownerHash: benchmarkCase.ownerHash,
    language: languageFor(benchmarkCase.transcript),
    providerConfidence: null,
    locale: languageFor(benchmarkCase.transcript) === "english" ? "en-AU" : "hi-IN",
    contacts,
    products,
    semantic: benchmarkCase.semantic,
  });

  for (let iteration = 0; iteration < 20; iteration++) {
    for (const benchmarkCase of cases) runCase(benchmarkCase);
  }

  const durations: number[] = [];
  let externalActionAllowedCount = 0;
  const iterationsPerCase = 200;
  for (let iteration = 0; iteration < iterationsPerCase; iteration++) {
    for (const benchmarkCase of cases) {
      const started = performance.now();
      const result = runCase(benchmarkCase);
      durations.push(performance.now() - started);
      if (result.externalActionAllowed) externalActionAllowedCount++;
    }
  }

  durations.sort((left, right) => left - right);
  const result = {
    schemaVersion: "NITSYCLAW-VOICE-VERIFIER-V1-BENCHMARK",
    freezeAggregateSha256: frozen.aggregateSha256,
    cases: cases.length,
    iterationsPerCase,
    measurements: durations.length,
    latencyMs: {
      p50: Number(percentile(durations, 0.5).toFixed(3)),
      p95: Number(percentile(durations, 0.95).toFixed(3)),
      p99: Number(percentile(durations, 0.99).toFixed(3)),
      max: Number((durations.at(-1) ?? 0).toFixed(3)),
    },
    frozenP95TargetMs: 250,
    externalActionAllowedCount,
  };

  console.log(JSON.stringify(result, null, 2));
  if (result.latencyMs.p95 > result.frozenP95TargetMs || externalActionAllowedCount !== 0) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Voice Verifier V1 benchmark failed.");
  process.exitCode = 1;
});
