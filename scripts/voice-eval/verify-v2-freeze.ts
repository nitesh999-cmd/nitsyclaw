import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type FreezeManifest = {
  schemaVersion: "NITSYCLAW-VOICE-SMOKE-V2-FREEZE";
  files: Array<{ path: string; sha256: string }>;
  aggregateSha256: string;
};

const directory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(directory, "..", "..");
const freezePath = join(directory, "voice-smoke-v2.freeze.json");

function aggregate(entries: ReadonlyArray<{ path: string; sha256: string }>): string {
  const canonical = [...entries]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((entry) => `${entry.path}\u0000${entry.sha256}\n`)
    .join("");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function frozenTextSha256(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n?/gu, "\n"), "utf8").digest("hex");
}

export async function verifyVoiceSmokeV2Freeze(): Promise<FreezeManifest> {
  const parsed = JSON.parse(await readFile(freezePath, "utf8")) as FreezeManifest;
  if (parsed.schemaVersion !== "NITSYCLAW-VOICE-SMOKE-V2-FREEZE") throw new Error("V2 freeze schema is invalid.");
  for (const entry of parsed.files) {
    if (!entry.path.startsWith("scripts/voice-eval/") || entry.path.includes("..")) throw new Error("V2 freeze path is invalid.");
    const text = await readFile(join(repositoryRoot, ...entry.path.split("/")), "utf8");
    const actual = frozenTextSha256(text);
    if (actual !== entry.sha256) throw new Error(`Frozen V2 file changed: ${entry.path}`);
  }
  if (aggregate(parsed.files) !== parsed.aggregateSha256) throw new Error("V2 aggregate freeze hash is invalid.");
  return parsed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void verifyVoiceSmokeV2Freeze()
    .then((frozen) => console.log(JSON.stringify({ frozen: true, ...frozen }, null, 2)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "V2 freeze verification failed.");
      process.exitCode = 1;
    });
}
