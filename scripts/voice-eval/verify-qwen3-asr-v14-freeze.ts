import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyQwen3AsrV13Freeze } from "./verify-qwen3-asr-v13-freeze.js";

export type Qwen3AsrV14Freeze = {
  schemaVersion: "NITSYCLAW-QWEN3-ASR-V1.4-UTF8-DIAGNOSTIC-FREEZE-1";
  frozenOn: "2026-08-11";
  startingCommit: "749cd5ab680815b16283af55774c6f3490773dc8";
  parentV13AggregateSha256: string;
  model: {
    revision: string;
    bytes: 4703114308;
    weightSha256: Record<string, string>;
    device: "cuda:0";
    dtype: "bfloat16";
    maxNewTokens: 128;
  };
  fixture: { caseId: "hinglish-business"; sha256: string; bytes: 234818 };
  transport: {
    childEnvironment: { PYTHONUTF8: "1"; PYTHONIOENCODING: "utf-8" };
    parentDecoder: { encoding: "utf-8"; fatal: true };
    pythonStreams: { encoding: "utf-8"; errors: "strict" };
    jsonEnsureAscii: false;
    rawStdoutEvidence: { byteCount: true; sha256: true; base64: true; strictDecode: true };
  };
  evidenceSchemas: {
    preflight: "NITSYCLAW-QWEN3-ASR-V1.4-PREFLIGHT-1";
    process: "NITSYCLAW-QWEN3-ASR-PROCESS-DIAGNOSTIC-V1.1";
    transport: "NITSYCLAW-QWEN3-ASR-V1.4-UTF8-TRANSPORT-EVIDENCE-1";
    adapterPayload: "NITSYCLAW-QWEN3-ASR-ADAPTER-V1.1";
  };
  policy: {
    diagnosticCases: 1;
    scoredCases: 2;
    scorerExecutionAuthorized: false;
    oneInferenceMaximum: true;
    retryAuthorized: false;
    offlineEnvironmentPolicy: "OFFLINE_ALLOWLIST_V1";
  };
  files: Array<{ path: string; sha256: string }>;
  aggregateSha256: string;
};

const directory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(directory, "..", "..");
const freezePath = join(directory, "qwen3-asr-v14-diagnostic.freeze.json");
const permittedPaths = new Set([
  "apps/bot/src/local-speech-synthesizer.ts",
  "scripts/synthesize-local-sapi.ps1",
  "scripts/voice-eval/qwen3-asr-adapter-v14.py",
  "scripts/voice-eval/qwen3-asr-adapter.py",
  "scripts/voice-eval/qwen3-asr-process-v14.ts",
  "scripts/voice-eval/qwen3-asr-process.ts",
  "scripts/voice-eval/run-qwen3-asr-v14-hinglish-diagnostic.ts",
  "scripts/voice-eval/voice-smoke-v2-spec.json",
]);

export function qwenV14TextSha256(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n?/gu, "\n"), "utf8").digest("hex");
}

function aggregate(entries: ReadonlyArray<{ path: string; sha256: string }>): string {
  const canonical = [...entries]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((entry) => `${entry.path}\u0000${entry.sha256}\n`)
    .join("");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export async function verifyQwen3AsrV14Freeze(): Promise<Qwen3AsrV14Freeze> {
  const parent = await verifyQwen3AsrV13Freeze();
  const parsed = JSON.parse(await readFile(freezePath, "utf8")) as Qwen3AsrV14Freeze;
  if (parsed.schemaVersion !== "NITSYCLAW-QWEN3-ASR-V1.4-UTF8-DIAGNOSTIC-FREEZE-1" ||
      parsed.frozenOn !== "2026-08-11" ||
      parsed.startingCommit !== "749cd5ab680815b16283af55774c6f3490773dc8" ||
      parsed.parentV13AggregateSha256 !== parent.aggregateSha256 ||
      parsed.parentV13AggregateSha256 !== "0f2c460dbf70b23b6193ba70ff3f3772dede0783ef78f3797d2e46fb55fedddb") {
    throw new Error("Qwen V1.4 parent freeze or starting point changed.");
  }
  if (parsed.model.revision !== "7278e1e70fe206f11671096ffdd38061171dd6e5" ||
      parsed.model.bytes !== 4_703_114_308 ||
      parsed.model.weightSha256["model-00001-of-00002.safetensors"] !== "a4cd1f1a04d90b757dc7f7dd26254e69a013b19e80efe590a83c6a3bde8608d6" ||
      parsed.model.weightSha256["model-00002-of-00002.safetensors"] !== "6e0b9d9e09e2e0238e7ef3cc8a484ab387e91b90f1900bedf88bc92d7929ccfc" ||
      parsed.model.device !== "cuda:0" || parsed.model.dtype !== "bfloat16" || parsed.model.maxNewTokens !== 128 ||
      parsed.fixture.caseId !== "hinglish-business" ||
      parsed.fixture.sha256 !== "c46218063f37892bdec79afe09c9353cec2396bafa9ffba527ba33951949c01c" ||
      parsed.fixture.bytes !== 234_818) {
    throw new Error("Qwen V1.4 model or fixture freeze changed.");
  }
  const controls = parsed.transport.childEnvironment;
  if (controls.PYTHONUTF8 !== "1" || controls.PYTHONIOENCODING !== "utf-8" ||
      Object.keys(controls).length !== 2 || parsed.transport.parentDecoder.encoding !== "utf-8" ||
      parsed.transport.parentDecoder.fatal !== true || parsed.transport.pythonStreams.encoding !== "utf-8" ||
      parsed.transport.pythonStreams.errors !== "strict" || parsed.transport.jsonEnsureAscii !== false ||
      Object.values(parsed.transport.rawStdoutEvidence).some((value) => value !== true)) {
    throw new Error("Qwen V1.4 UTF-8 transport contract changed.");
  }
  if (parsed.evidenceSchemas.preflight !== "NITSYCLAW-QWEN3-ASR-V1.4-PREFLIGHT-1" ||
      parsed.evidenceSchemas.process !== "NITSYCLAW-QWEN3-ASR-PROCESS-DIAGNOSTIC-V1.1" ||
      parsed.evidenceSchemas.transport !== "NITSYCLAW-QWEN3-ASR-V1.4-UTF8-TRANSPORT-EVIDENCE-1" ||
      parsed.evidenceSchemas.adapterPayload !== "NITSYCLAW-QWEN3-ASR-ADAPTER-V1.1" ||
      parsed.policy.diagnosticCases !== 1 || parsed.policy.scoredCases !== 2 ||
      parsed.policy.scorerExecutionAuthorized !== false || parsed.policy.oneInferenceMaximum !== true ||
      parsed.policy.retryAuthorized !== false || parsed.policy.offlineEnvironmentPolicy !== "OFFLINE_ALLOWLIST_V1") {
    throw new Error("Qwen V1.4 evidence schema or safety policy changed.");
  }
  if (parsed.files.length !== permittedPaths.size) throw new Error("Qwen V1.4 frozen file count changed.");
  for (const entry of parsed.files) {
    if (!permittedPaths.has(entry.path) || entry.path.includes("..")) throw new Error("Qwen V1.4 freeze path is invalid.");
    const text = await readFile(join(repositoryRoot, ...entry.path.split("/")), "utf8");
    if (qwenV14TextSha256(text) !== entry.sha256) throw new Error(`Frozen Qwen V1.4 file changed: ${entry.path}`);
  }
  if (aggregate(parsed.files) !== parsed.aggregateSha256) throw new Error("Qwen V1.4 aggregate freeze hash is invalid.");
  return parsed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void verifyQwen3AsrV14Freeze()
    .then((frozen) => console.log(JSON.stringify({ frozen: true, ...frozen }, null, 2)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Qwen V1.4 freeze verification failed.");
      process.exitCode = 1;
    });
}
