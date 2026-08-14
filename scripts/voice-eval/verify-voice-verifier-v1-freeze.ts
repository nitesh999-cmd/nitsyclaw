import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type VoiceVerifierV1Freeze = {
  schemaVersion: "NITSYCLAW-VOICE-VERIFIER-V1-FREEZE";
  frozenOn: string;
  methodology: string;
  files: Array<{ path: string; sha256: string }>;
  aggregateSha256: string;
};

const directory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(directory, "..", "..");
const freezePath = join(directory, "voice-verifier-v1.freeze.json");
const permittedPaths = new Set([
  "docs/voice-verifier-v1-spec.md",
  "scripts/voice-eval/voice-verifier-v1-fixtures.json",
]);

function aggregate(entries: ReadonlyArray<{ path: string; sha256: string }>): string {
  const canonical = [...entries]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((entry) => `${entry.path}\u0000${entry.sha256}\n`)
    .join("");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function voiceVerifierV1TextSha256(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n?/gu, "\n"), "utf8").digest("hex");
}

export async function verifyVoiceVerifierV1Freeze(): Promise<VoiceVerifierV1Freeze> {
  const parsed = JSON.parse(await readFile(freezePath, "utf8")) as VoiceVerifierV1Freeze;
  if (parsed.schemaVersion !== "NITSYCLAW-VOICE-VERIFIER-V1-FREEZE") {
    throw new Error("Voice Verifier V1 freeze schema is invalid.");
  }
  if (parsed.files.length !== permittedPaths.size) {
    throw new Error("Voice Verifier V1 freeze file count is invalid.");
  }
  for (const entry of parsed.files) {
    if (!permittedPaths.has(entry.path) || entry.path.includes("..")) {
      throw new Error("Voice Verifier V1 freeze path is invalid.");
    }
    const text = await readFile(join(repositoryRoot, ...entry.path.split("/")), "utf8");
    const actual = voiceVerifierV1TextSha256(text);
    if (actual !== entry.sha256) {
      throw new Error(`Frozen Voice Verifier V1 file changed: ${entry.path}`);
    }
  }
  if (aggregate(parsed.files) !== parsed.aggregateSha256) {
    throw new Error("Voice Verifier V1 aggregate freeze hash is invalid.");
  }
  return parsed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void verifyVoiceVerifierV1Freeze()
    .then((frozen) => console.log(JSON.stringify({ frozen: true, ...frozen }, null, 2)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Voice Verifier V1 freeze verification failed.");
      process.exitCode = 1;
    });
}
