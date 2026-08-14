import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type VoiceVerifierV1AdversarialFreeze = {
  schemaVersion: "NITSYCLAW-VOICE-VERIFIER-V1-ADVERSARIAL-FREEZE";
  frozenOn: string;
  initialCommit: string;
  immutableFiles: Array<{ role: string; path: string; sha256: string }>;
  initialImplementationFiles: Array<{ path: string; sha256: string }>;
  immutableAggregateSha256: string;
  initialImplementationAggregateSha256: string;
  completeInitialAggregateSha256: string;
};

const directory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(directory, "..", "..");
const freezePath = join(directory, "voice-verifier-v1-adversarial.freeze.json");

export function voiceVerifierAdversarialTextSha256(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n?/gu, "\n"), "utf8").digest("hex");
}

function aggregate(entries: ReadonlyArray<{ path: string; sha256: string; role?: string }>): string {
  const canonical = [...entries]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((entry) => `${entry.role ?? "implementation"}\u0000${entry.path}\u0000${entry.sha256}\n`)
    .join("");
  return voiceVerifierAdversarialTextSha256(canonical);
}

function assertSafeRelativePath(path: string): void {
  if (!path || path.includes("..") || path.includes("\\") || path.startsWith("/")) {
    throw new Error(`Adversarial freeze path is invalid: ${path}`);
  }
}

async function verifyEntries(entries: ReadonlyArray<{ path: string; sha256: string }>, label: string): Promise<void> {
  const paths = entries.map(({ path }) => path);
  if (paths.length !== new Set(paths).size) throw new Error(`${label} contains duplicate paths`);
  for (const entry of entries) {
    assertSafeRelativePath(entry.path);
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256)) throw new Error(`${label} hash is invalid: ${entry.path}`);
    const text = await readFile(join(repositoryRoot, ...entry.path.split("/")), "utf8");
    const actual = voiceVerifierAdversarialTextSha256(text);
    if (actual !== entry.sha256) throw new Error(`${label} changed: ${entry.path}`);
  }
}

export async function verifyVoiceVerifierV1AdversarialFreeze(options: {
  verifyInitialImplementation?: boolean;
} = {}): Promise<VoiceVerifierV1AdversarialFreeze> {
  const frozen = JSON.parse(await readFile(freezePath, "utf8")) as VoiceVerifierV1AdversarialFreeze;
  if (frozen.schemaVersion !== "NITSYCLAW-VOICE-VERIFIER-V1-ADVERSARIAL-FREEZE") {
    throw new Error("Adversarial freeze schema is invalid");
  }
  if (frozen.initialCommit !== "532a45b744e2ad0c626f02fe381a80f33e5a757b") {
    throw new Error("Adversarial freeze initial commit is invalid");
  }
  const roles = new Set(frozen.immutableFiles.map(({ role }) => role));
  for (const required of ["verifier_v1_spec", "adversarial_spec", "fixtures", "thresholds", "runner", "isolated_database_schema", "validator", "freeze_verifier"]) {
    if (!roles.has(required)) throw new Error(`Adversarial freeze role missing: ${required}`);
  }
  await verifyEntries(frozen.immutableFiles, "immutable adversarial artifact");
  if (aggregate(frozen.immutableFiles) !== frozen.immutableAggregateSha256) {
    throw new Error("Immutable adversarial aggregate mismatch");
  }
  if (aggregate(frozen.initialImplementationFiles) !== frozen.initialImplementationAggregateSha256) {
    throw new Error("Initial implementation aggregate metadata mismatch");
  }
  const complete = voiceVerifierAdversarialTextSha256(
    `${frozen.immutableAggregateSha256}\n${frozen.initialImplementationAggregateSha256}\n${frozen.initialCommit}\n`,
  );
  if (complete !== frozen.completeInitialAggregateSha256) {
    throw new Error("Complete initial adversarial aggregate mismatch");
  }
  if (options.verifyInitialImplementation) {
    await verifyEntries(frozen.initialImplementationFiles, "initial verifier implementation");
  }
  return frozen;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void verifyVoiceVerifierV1AdversarialFreeze({
    verifyInitialImplementation: process.argv.includes("--initial"),
  })
    .then((frozen) => console.log(JSON.stringify({
      frozen: true,
      initialImplementationVerified: process.argv.includes("--initial"),
      ...frozen,
    }, null, 2)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Adversarial freeze verification failed.");
      process.exitCode = 1;
    });
}
