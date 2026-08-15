import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyQwen3AsrV14Freeze } from "./verify-qwen3-asr-v14-freeze.js";
import { verifyVoiceSmokeV2Freeze } from "./verify-v2-freeze.js";
import { verifyVoiceSmokeV21Freeze } from "./verify-v2.1-freeze.js";

export type Qwen3AsrV15Freeze = {
  schemaVersion: "NITSYCLAW-QWEN3-ASR-V1.5-SCORED-TWO-CASE-FREEZE-1";
  frozenOn: "2026-08-11";
  startingCommit: "332b529d5de8d9fb3bb9fa32d3ffc5fc9b78ccca";
  parentV14AggregateSha256: string;
  frozenV2AggregateSha256: string;
  frozenV21AggregateSha256: string;
  model: {
    repository: "Qwen/Qwen3-ASR-1.7B";
    revision: string;
    license: "apache-2.0";
    bytes: number;
    files: Array<{ name: string; bytes: number; sha256: string }>;
  };
  runtime: {
    python: "3.12.10";
    pythonExecutableSha256: string;
    packages: Record<string, string>;
    device: "cuda:0";
    dtype: "bfloat16";
    maxInferenceBatchSize: 1;
    maxNewTokens: 128;
    timeoutMs: 600000;
    ffmpeg: { version: "8.1.2"; bytes: number; sha256: string };
  };
  cases: Array<{
    order: 1 | 2;
    caseId: "english-solar-au" | "hinglish-business";
    expectedLanguage: "english" | "hinglish";
    expectedTranscript: string;
    expectedTranscriptSha256: string;
    wavSha256: string;
    wavBytes: number;
  }>;
  invocation: {
    executableName: "python.exe";
    executableSha256: string;
    arguments: string[];
    shell: false;
    environmentPolicy: "OFFLINE_ALLOWLIST_V1";
    childEnvironment: { PYTHONUTF8: "1"; PYTHONIOENCODING: "utf-8" };
    parentDecoder: { encoding: "utf-8"; fatal: true };
    modelChildCount: 1;
    caseCount: 2;
    caseOrder: ["english-solar-au", "hinglish-business"];
    mode: "scored";
  };
  thresholds: {
    englishWerMax: 0.2;
    hinglishWerMax: 0.4;
    criticalEntityAccuracyMin: 1;
    intentAccuracyMin: 1;
    negationAccuracyMin: 1;
    languageAccuracyMin: 1;
    clipLatencyMsMax: 45000;
    cleanupRequired: true;
    confidenceRequiredForExternalAction: true;
  };
  evidenceSchemas: {
    preflight: "NITSYCLAW-QWEN3-ASR-V1.5-SCORED-PREFLIGHT-1";
    process: "NITSYCLAW-QWEN3-ASR-PROCESS-DIAGNOSTIC-V1.1";
    transport: "NITSYCLAW-QWEN3-ASR-V1.5-SCORED-UTF8-EVIDENCE-1";
    result: "NITSYCLAW-QWEN3-ASR-V1.5-SCORED-RESULT-1";
    adapterPayload: "NITSYCLAW-QWEN3-ASR-ADAPTER-V1.1";
  };
  policy: {
    diagnosticChildAuthorized: false;
    scoredChildCount: 1;
    scoredCases: 2;
    scorerExecutions: 1;
    retryAuthorized: false;
    externalActionAllowed: false;
    missingConfidence: null;
    werCannotOverrideSafetyFailure: true;
    atomicNoOverwrite: true;
    offlineEnvironmentPolicy: "OFFLINE_ALLOWLIST_V1";
  };
  files: Array<{ path: string; sha256: string }>;
  aggregateSha256: string;
};

const directory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(directory, "..", "..");
const freezePath = join(directory, "qwen3-asr-v15-scored.freeze.json");
const permittedPaths = new Set([
  "apps/bot/src/local-speech-synthesizer.ts",
  "docs/qwen3-asr-runtime-bom-2026-08-11.json",
  "scripts/synthesize-local-sapi.ps1",
  "scripts/voice-eval/qwen3-asr-adapter-v14.py",
  "scripts/voice-eval/qwen3-asr-adapter.py",
  "scripts/voice-eval/qwen3-asr-package.lock.txt",
  "scripts/voice-eval/qwen3-asr-process-v14.ts",
  "scripts/voice-eval/qwen3-asr-process.ts",
  "scripts/voice-eval/qwen3-asr-runtime-py312.lock.txt",
  "scripts/voice-eval/qwen3-asr-v21-score.ts",
  "scripts/voice-eval/qwen3-asr-v15.test.ts",
  "scripts/voice-eval/run-qwen3-asr-v15-scored-smoke.ts",
  "scripts/voice-eval/scoring-v2.1.ts",
  "scripts/voice-eval/scoring-v2.ts",
  "scripts/voice-eval/voice-smoke-v2-spec.json",
]);

export function qwenV15TextSha256(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n?/gu, "\n"), "utf8").digest("hex");
}

function aggregate(entries: ReadonlyArray<{ path: string; sha256: string }>): string {
  const canonical = [...entries]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((entry) => `${entry.path}\u0000${entry.sha256}\n`)
    .join("");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function assertExactJson(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message);
}

export async function verifyQwen3AsrV15Freeze(): Promise<Qwen3AsrV15Freeze> {
  const [parent, frozenV2, frozenV21] = await Promise.all([
    verifyQwen3AsrV14Freeze(),
    verifyVoiceSmokeV2Freeze(),
    verifyVoiceSmokeV21Freeze(),
  ]);
  const parsed = JSON.parse(await readFile(freezePath, "utf8")) as Qwen3AsrV15Freeze;
  if (parsed.schemaVersion !== "NITSYCLAW-QWEN3-ASR-V1.5-SCORED-TWO-CASE-FREEZE-1" ||
      parsed.frozenOn !== "2026-08-11" ||
      parsed.startingCommit !== "332b529d5de8d9fb3bb9fa32d3ffc5fc9b78ccca" ||
      parsed.parentV14AggregateSha256 !== parent.aggregateSha256 ||
      parsed.parentV14AggregateSha256 !== "5545f163e6af1ae262ea6cd522189a04d6df636dd760e48a800b7709dc976f1b" ||
      parsed.frozenV2AggregateSha256 !== frozenV2.aggregateSha256 ||
      parsed.frozenV2AggregateSha256 !== "d169f8584a158af92463bf84ad7afa257d2daeb5d2ed13d4df3b585e28115d7b" ||
      parsed.frozenV21AggregateSha256 !== frozenV21.aggregateSha256 ||
      // Corrected 2026-08-14 under the recorded scoring-v2.1.ts exception. The
      // pre-correction value was
      // fba510500f928675905d67e838caecd9b1075d708c96938d5249fc8d873820a5; see the
      // `corrections` record in both freeze manifests. The check is unchanged and
      // still pins one exact expected digest.
      parsed.frozenV21AggregateSha256 !== "01be6ff8e0fbb4e7eb426a053174ea16fa7ba6e07d3579278d63f66746a165ef") {
    throw new Error("Qwen V1.5 parent freezes or starting point changed.");
  }

  if (parsed.model.repository !== "Qwen/Qwen3-ASR-1.7B" ||
      parsed.model.revision !== "7278e1e70fe206f11671096ffdd38061171dd6e5" ||
      parsed.model.license !== "apache-2.0" || parsed.model.bytes !== 4_703_114_308 ||
      parsed.model.files.length !== 12 || parsed.model.files.reduce((sum, item) => sum + item.bytes, 0) !== parsed.model.bytes) {
    throw new Error("Qwen V1.5 model identity changed.");
  }
  const names = parsed.model.files.map((item) => item.name);
  if (new Set(names).size !== names.length || parsed.model.files.some((item) =>
    !/^[A-Za-z0-9._-]+$/u.test(item.name) || !/^[a-f0-9]{64}$/u.test(item.sha256) || item.bytes < 0)) {
    throw new Error("Qwen V1.5 model file manifest is invalid.");
  }

  if (parsed.runtime.python !== "3.12.10" ||
      parsed.runtime.pythonExecutableSha256 !== "0b471133e110cfb53a061cad528ce8e517d7b9ac41a0a396c39ad795a487fc14" ||
      parsed.runtime.device !== "cuda:0" || parsed.runtime.dtype !== "bfloat16" ||
      parsed.runtime.maxInferenceBatchSize !== 1 || parsed.runtime.maxNewTokens !== 128 ||
      parsed.runtime.timeoutMs !== 600_000 || parsed.runtime.ffmpeg.version !== "8.1.2" ||
      parsed.runtime.ffmpeg.bytes !== 242_496_512 ||
      parsed.runtime.ffmpeg.sha256 !== "ad8f211bc894755e0061c55ab280ae00e8d3d4f15a8cc4372b24cfa247b5942e" ||
      parsed.runtime.packages["qwen-asr"] !== "0.0.6" || parsed.runtime.packages.torch !== "2.9.1+cu128" ||
      parsed.runtime.packages.transformers !== "4.57.6" || Object.keys(parsed.runtime.packages).length !== 51) {
    throw new Error("Qwen V1.5 runtime identity changed.");
  }

  const expectedCases = [
    {
      order: 1,
      caseId: "english-solar-au",
      expectedLanguage: "english",
      expectedTranscript: "Please call Raj Sharma in Melbourne tomorrow at three thirty P M about the ten kilowatt Fronius solar inverter.",
      expectedTranscriptSha256: "b447f9f661aa363e8d200c4ea93645d5dd1095e3ec351116788a3fcaa8ab38ac",
      wavSha256: "235c7e915a50123a5ba9e10ed32070186407a38b64bf08bf3b242f58961f2f5a",
      wavBytes: 220_416,
    },
    {
      order: 2,
      caseId: "hinglish-business",
      expectedLanguage: "hinglish",
      expectedTranscript: "Kal subah Ravi ko Sydney mein call karna aur Tesla Powerwall three ka quote fifteen percent discount ke saath check karna.",
      expectedTranscriptSha256: "23ae748533cebc26f9fde470a905ff58607daf14c7749dfe2b1a1637ac5c4510",
      wavSha256: "c46218063f37892bdec79afe09c9353cec2396bafa9ffba527ba33951949c01c",
      wavBytes: 234_818,
    },
  ];
  assertExactJson(parsed.cases, expectedCases, "Qwen V1.5 case order, ground truth or fixture identity changed.");

  const expectedArguments = [
    "-I", "<reviewed-qwen3-asr-adapter-v14.py>",
    "--model-path", "<pinned-model-revision:7278e1e70fe206f11671096ffdd38061171dd6e5>",
    "--audio-root", "<private-synthetic-audio-root>",
    "--case", "english-solar-au=<private-synthetic-wav>",
    "--case", "hinglish-business=<private-synthetic-wav>",
    "--max-new-tokens", "128", "--mode", "scored",
  ];
  if (parsed.invocation.executableName !== "python.exe" ||
      parsed.invocation.executableSha256 !== parsed.runtime.pythonExecutableSha256 ||
      parsed.invocation.shell !== false || parsed.invocation.environmentPolicy !== "OFFLINE_ALLOWLIST_V1" ||
      parsed.invocation.modelChildCount !== 1 || parsed.invocation.caseCount !== 2 || parsed.invocation.mode !== "scored") {
    throw new Error("Qwen V1.5 one-child invocation changed.");
  }
  assertExactJson(parsed.invocation.arguments, expectedArguments, "Qwen V1.5 invocation arguments changed.");
  assertExactJson(parsed.invocation.caseOrder, ["english-solar-au", "hinglish-business"], "Qwen V1.5 case order changed.");
  assertExactJson(parsed.invocation.childEnvironment, { PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" }, "Qwen V1.5 UTF-8 child controls changed.");
  assertExactJson(parsed.invocation.parentDecoder, { encoding: "utf-8", fatal: true }, "Qwen V1.5 strict parent decoder changed.");

  assertExactJson(parsed.thresholds, {
    englishWerMax: 0.2,
    hinglishWerMax: 0.4,
    criticalEntityAccuracyMin: 1,
    intentAccuracyMin: 1,
    negationAccuracyMin: 1,
    languageAccuracyMin: 1,
    clipLatencyMsMax: 45_000,
    cleanupRequired: true,
    confidenceRequiredForExternalAction: true,
  }, "Qwen V1.5 thresholds changed.");
  assertExactJson(parsed.evidenceSchemas, {
    preflight: "NITSYCLAW-QWEN3-ASR-V1.5-SCORED-PREFLIGHT-1",
    process: "NITSYCLAW-QWEN3-ASR-PROCESS-DIAGNOSTIC-V1.1",
    transport: "NITSYCLAW-QWEN3-ASR-V1.5-SCORED-UTF8-EVIDENCE-1",
    result: "NITSYCLAW-QWEN3-ASR-V1.5-SCORED-RESULT-1",
    adapterPayload: "NITSYCLAW-QWEN3-ASR-ADAPTER-V1.1",
  }, "Qwen V1.5 evidence schemas changed.");
  assertExactJson(parsed.policy, {
    diagnosticChildAuthorized: false,
    scoredChildCount: 1,
    scoredCases: 2,
    scorerExecutions: 1,
    retryAuthorized: false,
    externalActionAllowed: false,
    missingConfidence: null,
    werCannotOverrideSafetyFailure: true,
    atomicNoOverwrite: true,
    offlineEnvironmentPolicy: "OFFLINE_ALLOWLIST_V1",
  }, "Qwen V1.5 execution or release policy changed.");

  if (parsed.files.length !== permittedPaths.size) throw new Error("Qwen V1.5 frozen file count changed.");
  for (const entry of parsed.files) {
    if (!permittedPaths.has(entry.path) || entry.path.includes("..")) throw new Error("Qwen V1.5 freeze path is invalid.");
    const text = await readFile(join(repositoryRoot, ...entry.path.split("/")), "utf8");
    if (qwenV15TextSha256(text) !== entry.sha256) throw new Error(`Frozen Qwen V1.5 file changed: ${entry.path}`);
  }
  if (aggregate(parsed.files) !== parsed.aggregateSha256) throw new Error("Qwen V1.5 aggregate freeze hash is invalid.");
  return parsed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void verifyQwen3AsrV15Freeze()
    .then((frozen) => console.log(JSON.stringify({ frozen: true, ...frozen }, null, 2)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Qwen V1.5 freeze verification failed.");
      process.exitCode = 1;
    });
}
