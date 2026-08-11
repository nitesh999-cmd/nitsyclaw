import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Qwen3AsrFreezeManifest = {
  schemaVersion: "NITSYCLAW-QWEN3-ASR-1.7B-SMOKE-FREEZE-V1";
  frozenOn: string;
  evidencePath: string;
  model: {
    repository: "Qwen/Qwen3-ASR-1.7B";
    revision: string;
    license: "apache-2.0";
    bytes: number;
    weightSha256: Record<string, string>;
  };
  runtime: {
    python: "3.12.10";
    qwenAsr: "0.0.6";
    torch: "2.9.1+cu128";
    transformers: "4.57.6";
    dtype: "bfloat16";
    device: "cuda:0";
    maxInferenceBatchSize: 1;
    maxNewTokens: 128;
  };
  priorFreeze: { v2AggregateSha256: string; v21AggregateSha256: string };
  releasePolicy: {
    thresholdSource: "NITSYCLAW-VOICE-SMOKE-V2";
    everyCriticalEntityRequired: true;
    everyIntentRequired: true;
    negationRequired: true;
    languageRequired: true;
    werCannotOverrideSafety: true;
    missingConfidenceRequiresOwnerConfirmation: true;
  };
  files: Array<{ path: string; sha256: string }>;
  aggregateSha256: string;
};

const directory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(directory, "..", "..");
const freezePath = join(directory, "qwen3-asr-smoke.freeze.json");
const permittedPaths = new Set([
  "scripts/voice-eval/qwen3-asr-adapter.py",
  "scripts/voice-eval/qwen3-asr-package.lock.txt",
  "scripts/voice-eval/qwen3-asr-process.ts",
  "scripts/voice-eval/qwen3-asr-runtime-py312.lock.txt",
  "scripts/voice-eval/qwen3-asr-v21-score.ts",
  "scripts/voice-eval/run-qwen3-asr-smoke.ts",
]);

function aggregate(entries: ReadonlyArray<{ path: string; sha256: string }>): string {
  const canonical = [...entries]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((entry) => `${entry.path}\u0000${entry.sha256}\n`)
    .join("");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function frozenQwenTextSha256(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n?/gu, "\n"), "utf8").digest("hex");
}

export async function verifyQwen3AsrSmokeFreeze(): Promise<Qwen3AsrFreezeManifest> {
  const parsed = JSON.parse(await readFile(freezePath, "utf8")) as Qwen3AsrFreezeManifest;
  if (parsed.schemaVersion !== "NITSYCLAW-QWEN3-ASR-1.7B-SMOKE-FREEZE-V1") {
    throw new Error("Qwen3-ASR freeze schema is invalid.");
  }
  if (parsed.files.length !== permittedPaths.size || parsed.model.repository !== "Qwen/Qwen3-ASR-1.7B" ||
      parsed.model.revision !== "7278e1e70fe206f11671096ffdd38061171dd6e5" ||
      parsed.model.license !== "apache-2.0" || parsed.model.bytes !== 4_703_114_308 ||
      parsed.runtime.python !== "3.12.10" || parsed.runtime.qwenAsr !== "0.0.6" ||
      parsed.runtime.torch !== "2.9.1+cu128" || parsed.runtime.transformers !== "4.57.6" ||
      parsed.runtime.dtype !== "bfloat16" || parsed.runtime.device !== "cuda:0" ||
      parsed.runtime.maxInferenceBatchSize !== 1 || parsed.runtime.maxNewTokens !== 128) {
    throw new Error("Qwen3-ASR frozen model or runtime settings changed.");
  }
  if (parsed.releasePolicy.thresholdSource !== "NITSYCLAW-VOICE-SMOKE-V2" ||
      !parsed.releasePolicy.everyCriticalEntityRequired || !parsed.releasePolicy.everyIntentRequired ||
      !parsed.releasePolicy.negationRequired || !parsed.releasePolicy.languageRequired ||
      !parsed.releasePolicy.werCannotOverrideSafety || !parsed.releasePolicy.missingConfidenceRequiresOwnerConfirmation) {
    throw new Error("Qwen3-ASR frozen safety policy changed.");
  }
  for (const entry of parsed.files) {
    if (!permittedPaths.has(entry.path) || entry.path.includes("..")) throw new Error("Qwen3-ASR freeze path is invalid.");
    const text = await readFile(join(repositoryRoot, ...entry.path.split("/")), "utf8");
    if (frozenQwenTextSha256(text) !== entry.sha256) throw new Error(`Frozen Qwen3-ASR file changed: ${entry.path}`);
  }
  if (aggregate(parsed.files) !== parsed.aggregateSha256) throw new Error("Qwen3-ASR aggregate freeze hash is invalid.");
  return parsed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void verifyQwen3AsrSmokeFreeze()
    .then((frozen) => console.log(JSON.stringify({ frozen: true, ...frozen }, null, 2)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Qwen3-ASR freeze verification failed.");
      process.exitCode = 1;
    });
}
