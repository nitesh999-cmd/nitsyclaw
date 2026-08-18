import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type FreezeManifest = {
  schemaVersion: "NITSYCLAW-VOICE-SMOKE-V2.1-HELD-OUT-FREEZE";
  frozenOn: string;
  methodology: string;
  files: Array<{ path: string; sha256: string }>;
  aggregateSha256: string;
};

const directory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(directory, "..", "..");
const freezePath = join(directory, "voice-smoke-v2.1-held-out.freeze.json");
const permittedPaths = new Set([
  "docs/voice-smoke-v2.1-held-out-spec.md",
  "scripts/voice-eval/v2.1-held-out-fixtures.json",
  "scripts/voice-eval/scoring-v2.1.ts",
]);

function aggregate(entries: ReadonlyArray<{ path: string; sha256: string }>): string {
  const canonical = [...entries]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((entry) => `${entry.path}\u0000${entry.sha256}\n`)
    .join("");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function frozenV21TextSha256(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n?/gu, "\n"), "utf8").digest("hex");
}

export async function verifyVoiceSmokeV21Freeze(): Promise<FreezeManifest> {
  const parsed = JSON.parse(await readFile(freezePath, "utf8")) as FreezeManifest;
  if (parsed.schemaVersion !== "NITSYCLAW-VOICE-SMOKE-V2.1-HELD-OUT-FREEZE") throw new Error("V2.1 freeze schema is invalid.");
  if (parsed.files.length !== permittedPaths.size) throw new Error("V2.1 freeze file count is invalid.");
  for (const entry of parsed.files) {
    if (!permittedPaths.has(entry.path) || entry.path.includes("..")) throw new Error("V2.1 freeze path is invalid.");
    const text = await readFile(join(repositoryRoot, ...entry.path.split("/")), "utf8");
    const actual = frozenV21TextSha256(text);
    if (actual !== entry.sha256) throw new Error(`Frozen V2.1 file changed: ${entry.path}`);
  }
  if (aggregate(parsed.files) !== parsed.aggregateSha256) throw new Error("V2.1 aggregate freeze hash is invalid.");
  return parsed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void verifyVoiceSmokeV21Freeze()
    .then((frozen) => console.log(JSON.stringify({ frozen: true, ...frozen }, null, 2)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "V2.1 freeze verification failed.");
      process.exitCode = 1;
    });
}
