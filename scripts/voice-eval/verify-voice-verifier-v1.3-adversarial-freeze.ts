import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateVoiceVerifierV11AdversarialFreezeInputs } from "./validate-voice-verifier-v1.1-adversarial.js";
import { verifyVoiceVerifierV1AdversarialFreeze } from "./verify-voice-verifier-v1-adversarial-freeze.js";
import { verifyVoiceVerifierV11AdversarialFreeze } from "./verify-voice-verifier-v1.1-adversarial-freeze.js";

/**
 * V1.3 exists because the V1.1 fixture correction changed bytes that the V1.2
 * corpus had already frozen. V1.2 is deliberately left untouched and now fails
 * its own verification — that failure is the tamper-evidence mechanism working.
 * V1.3 supersedes it and carries the audit trail forward: every prior artifact
 * whose bytes legitimately changed is recorded here with both its pre-correction
 * digest and its current digest, and the pre-correction digest is cross-checked
 * against what V1.2 itself still records. Nothing frozen is rewritten.
 */

type HashedFile = { role?: string; path: string; sha256: string };

type PriorChainEntry = HashedFile & {
  /** Present only when the correction legitimately changed this artifact. */
  previousSha256?: string;
  supersededReason?: string;
  /** Where V1.2 still records `previousSha256`, so the claim is checkable. */
  previousRecordedIn?: "v1_2_corpus_historical_evidence" | "v1_2_freeze_immutable_files";
};

type V13Corpus = {
  schemaVersion: "NITSYCLAW-VOICE-VERIFIER-V1.3-ADVERSARIAL-CORPUS";
  createdOn: string;
  baseCommit: string;
  supersedes: "NITSYCLAW-VOICE-VERIFIER-V1.2-ADVERSARIAL-CORPUS";
  voiceReleaseAuthorized: false;
  fixtureCorrection: {
    fixtureId: string;
    operation: "mutate_each_binding_field";
    previousExpectedRejected: true;
    correctedExpectedRejected: false;
    rationale: string;
  };
  sharedImmutableInputs: HashedFile[];
  priorChain: PriorChainEntry[];
  runners: HashedFile[];
  fixtureCounts: {
    check: number;
    cancel: number;
    weekday: number;
    semanticLifecycle: number;
    binding: number;
    persistence: number;
    totalFixtureRecords: number;
    totalRunnerAssertions: number;
  };
  v11ImmutableAggregateSha256: string;
  v11CompleteInitialAggregateSha256: string;
};

export type VoiceVerifierV13AdversarialFreeze = {
  schemaVersion: "NITSYCLAW-VOICE-VERIFIER-V1.3-ADVERSARIAL-FREEZE";
  frozenOn: string;
  baseCommit: string;
  immutableFiles: Array<{ role: string; path: string; sha256: string }>;
  implementationSnapshotFiles: Array<{ path: string; sha256: string }>;
  immutableAggregateSha256: string;
  implementationSnapshotAggregateSha256: string;
  completeAggregateSha256: string;
};

const directory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(directory, "..", "..");
const corpusPath = join(directory, "voice-verifier-v1.3-adversarial-corpus.json");
const freezePath = join(directory, "voice-verifier-v1.3-adversarial.freeze.json");
const v12CorpusPath = join(directory, "voice-verifier-v1.2-adversarial-corpus.json");
const v12FreezePath = join(directory, "voice-verifier-v1.2-adversarial.freeze.json");

/** The repaired runner must keep evaluating all six mutations independently. */
const REQUIRED_RUNNER_ASSERTIONS = [
  "expect(rejectedMutations).toBe(mutations.length);",
  "expect(rejectedMutations).toBe(6);",
  `if (fixture.operation === "mutate_each_binding_field") expect(operation).not.toThrow();`,
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function voiceVerifierV13TextSha256(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n?/gu, "\n"), "utf8").digest("hex");
}

function aggregate(entries: ReadonlyArray<HashedFile>): string {
  const canonical = [...entries]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((entry) => `${entry.role ?? "implementation"}\0${entry.path}\0${entry.sha256}\n`)
    .join("");
  return voiceVerifierV13TextSha256(canonical);
}

function assertSafeRelativePath(path: string): void {
  if (!path || path.includes("..") || path.includes("\\") || path.startsWith("/")) {
    throw new Error(`V1.3 freeze path is invalid: ${path}`);
  }
}

async function readNormalized(path: string): Promise<string> {
  return (await readFile(join(repositoryRoot, ...path.split("/")), "utf8")).replace(/\r\n?/gu, "\n");
}

async function verifyEntries(entries: ReadonlyArray<HashedFile>, label: string): Promise<void> {
  const paths = entries.map(({ path }) => path);
  assert(paths.length === new Set(paths).size, `${label} contains duplicate paths`);
  for (const entry of entries) {
    assertSafeRelativePath(entry.path);
    assert(/^[a-f0-9]{64}$/u.test(entry.sha256), `${label} hash is invalid: ${entry.path}`);
    const actual = voiceVerifierV13TextSha256(await readNormalized(entry.path));
    assert(actual === entry.sha256, `${label} changed: ${entry.path}`);
  }
}

/**
 * Proves the corrected fixture cannot be quietly reverted. Under the original
 * V1.1 runner an accepted binding mutation raised inside `expect(...).toThrow()`,
 * that assertion error escaped the operation, and the outer
 * `expect(operation).toThrow()` passed — so `expectedRejected: true` turned a
 * real regression into a green test. The corrected value is `false`, with each
 * of the six mutations proven rejected individually.
 */
async function verifyFixtureCorrection(corpus: V13Corpus): Promise<void> {
  const fixtures = JSON.parse(await readNormalized("scripts/voice-eval/voice-verifier-v1.1-adversarial-fixtures.json")) as {
    persistenceCases: Array<{ id: string; operation: string; accepted: number; expectedRejected: boolean }>;
  };
  const corrected = fixtures.persistenceCases.find(({ id }) => id === corpus.fixtureCorrection.fixtureId);
  assert(corrected, `corrected fixture missing: ${corpus.fixtureCorrection.fixtureId}`);
  assert(corrected.operation === corpus.fixtureCorrection.operation, "corrected fixture operation changed");
  assert(
    corrected.expectedRejected === corpus.fixtureCorrection.correctedExpectedRejected,
    "corrected fixture expectation was reverted — the six-mutation false negative is live again",
  );
  assert(
    corpus.fixtureCorrection.previousExpectedRejected !== corpus.fixtureCorrection.correctedExpectedRejected,
    "fixture correction records no actual change",
  );

  const runner = await readNormalized("packages/shared/test/voice-verifier-adversarial-v1.2.test.ts");
  for (const required of REQUIRED_RUNNER_ASSERTIONS) {
    assert(runner.includes(required), `repaired runner assertion missing: ${required}`);
  }
}

/**
 * Every prior artifact is still verified byte-for-byte. Where the correction
 * legitimately changed one, the pre-correction digest must match what V1.2
 * still records, so the "before" value is taken from the untouched frozen
 * record rather than asserted by V1.3.
 */
async function verifyPriorChain(corpus: V13Corpus): Promise<void> {
  await verifyEntries(corpus.priorChain, "V1.3 prior chain artifact");

  const v12Corpus = JSON.parse(await readFile(v12CorpusPath, "utf8")) as { historicalEvidence: HashedFile[] };
  const v12Freeze = JSON.parse(await readFile(v12FreezePath, "utf8")) as { immutableFiles: HashedFile[] };

  let supersededCount = 0;
  for (const entry of corpus.priorChain) {
    if (entry.previousSha256 === undefined) continue;
    supersededCount++;
    assert(/^[a-f0-9]{64}$/u.test(entry.previousSha256), `superseded digest invalid: ${entry.path}`);
    assert(entry.previousSha256 !== entry.sha256, `superseded entry records no change: ${entry.path}`);
    assert(Boolean(entry.supersededReason), `superseded entry has no reason: ${entry.path}`);

    const source = entry.previousRecordedIn === "v1_2_freeze_immutable_files"
      ? v12Freeze.immutableFiles
      : v12Corpus.historicalEvidence;
    const recorded = source.find(({ path }) => path === entry.path);
    assert(recorded, `V1.2 does not record ${entry.path}, so its pre-correction digest is unprovable`);
    assert(
      recorded.sha256 === entry.previousSha256,
      `pre-correction digest for ${entry.path} does not match the V1.2 record`,
    );
  }
  assert(supersededCount > 0, "V1.3 must record at least one superseded artifact");
}

export async function validateVoiceVerifierV13Corpus(): Promise<Record<string, unknown>> {
  const corpus = JSON.parse(await readFile(corpusPath, "utf8")) as V13Corpus;
  assert(corpus.schemaVersion === "NITSYCLAW-VOICE-VERIFIER-V1.3-ADVERSARIAL-CORPUS", "V1.3 corpus schema invalid");
  assert(corpus.supersedes === "NITSYCLAW-VOICE-VERIFIER-V1.2-ADVERSARIAL-CORPUS", "V1.3 supersession target changed");
  assert(corpus.voiceReleaseAuthorized === false, "V1.3 must not authorize voice release");

  await verifyEntries(corpus.sharedImmutableInputs, "V1.3 shared immutable input");
  await verifyEntries(corpus.runners, "V1.3 runner");
  await verifyPriorChain(corpus);
  await verifyFixtureCorrection(corpus);

  const v11Validation = await validateVoiceVerifierV11AdversarialFreezeInputs();
  const counts = v11Validation.counts as Record<string, number>;
  for (const key of ["check", "cancel", "weekday", "semanticLifecycle", "binding", "persistence"] as const) {
    assert(counts[key] === corpus.fixtureCounts[key], `${key} fixture count changed`);
  }
  assert(counts.total === corpus.fixtureCounts.totalFixtureRecords, "total fixture count changed");
  const computedAssertions = counts.check + counts.cancel + counts.weekday + counts.semanticLifecycle
    + counts.binding + counts.persistence + 7;
  assert(computedAssertions === corpus.fixtureCounts.totalRunnerAssertions, "runner assertion count changed");

  // The V1 chain is untouched by the correction and must still verify as frozen.
  const v1 = await verifyVoiceVerifierV1AdversarialFreeze();
  const v11 = await verifyVoiceVerifierV11AdversarialFreeze();
  assert(v11.immutableAggregateSha256 === corpus.v11ImmutableAggregateSha256, "V1.1 immutable aggregate changed");
  assert(
    v11.completeInitialAggregateSha256 === corpus.v11CompleteInitialAggregateSha256,
    "V1.1 complete aggregate changed",
  );
  return {
    valid: true,
    supersedes: corpus.supersedes,
    historicalV1AggregateSha256: v1.completeInitialAggregateSha256,
    v11CompleteInitialAggregateSha256: v11.completeInitialAggregateSha256,
    fixtureCounts: corpus.fixtureCounts,
    supersededArtifacts: corpus.priorChain.filter(({ previousSha256 }) => previousSha256 !== undefined).length,
  };
}

export async function verifyVoiceVerifierV13AdversarialFreeze(options: {
  verifyImplementationSnapshot?: boolean;
} = {}): Promise<VoiceVerifierV13AdversarialFreeze> {
  await validateVoiceVerifierV13Corpus();
  const frozen = JSON.parse(await readFile(freezePath, "utf8")) as VoiceVerifierV13AdversarialFreeze;
  assert(frozen.schemaVersion === "NITSYCLAW-VOICE-VERIFIER-V1.3-ADVERSARIAL-FREEZE", "V1.3 freeze schema invalid");
  const roles = new Set(frozen.immutableFiles.map(({ role }) => role));
  for (const required of ["corpus", "freeze_verifier", "corrected_runner", "runner_diff"]) {
    assert(roles.has(required), `V1.3 freeze role missing: ${required}`);
  }
  await verifyEntries(frozen.immutableFiles, "V1.3 immutable artifact");
  assert(aggregate(frozen.immutableFiles) === frozen.immutableAggregateSha256, "V1.3 immutable aggregate mismatch");
  assert(
    aggregate(frozen.implementationSnapshotFiles) === frozen.implementationSnapshotAggregateSha256,
    "V1.3 implementation snapshot aggregate metadata mismatch",
  );
  const complete = voiceVerifierV13TextSha256(
    `${frozen.immutableAggregateSha256}\n${frozen.implementationSnapshotAggregateSha256}\n${frozen.baseCommit}\n`,
  );
  assert(complete === frozen.completeAggregateSha256, "V1.3 complete aggregate mismatch");
  // The snapshot records where the implementation stood at the freeze. Voice is
  // NO GO and the implementation is still moving, so drift is only an error when
  // the caller explicitly asks to re-prove that snapshot.
  if (options.verifyImplementationSnapshot) {
    await verifyEntries(frozen.implementationSnapshotFiles, "V1.3 implementation snapshot");
  }
  return frozen;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const validateOnly = process.argv.includes("--validate-only");
  void (validateOnly
    ? validateVoiceVerifierV13Corpus()
    : verifyVoiceVerifierV13AdversarialFreeze({ verifyImplementationSnapshot: process.argv.includes("--snapshot") }))
    .then((result) => console.log(JSON.stringify({ validateOnly, ...result }, null, 2)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "V1.3 freeze verification failed.");
      process.exitCode = 1;
    });
}
