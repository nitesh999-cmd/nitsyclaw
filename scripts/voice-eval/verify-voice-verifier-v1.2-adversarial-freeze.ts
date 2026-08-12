import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateVoiceVerifierV11AdversarialFreezeInputs } from "./validate-voice-verifier-v1.1-adversarial.js";
import { verifyVoiceVerifierV1AdversarialFreeze } from "./verify-voice-verifier-v1-adversarial-freeze.js";
import { verifyVoiceVerifierV11AdversarialFreeze } from "./verify-voice-verifier-v1.1-adversarial-freeze.js";

type HashedFile = { role?: string; path: string; sha256: string };

type V12Corpus = {
  schemaVersion: "NITSYCLAW-VOICE-VERIFIER-V1.2-ADVERSARIAL-CORPUS";
  baseCommit: "eaff2ba5f223ec8ded19ae5d7c0f38bce3d0210e";
  productionImplementationCommit: "be4cd77e9f800493907ebcd7ea76fbac4f8086ee";
  voiceReleaseAuthorized: false;
  sharedImmutableInputs: HashedFile[];
  historicalEvidence: HashedFile[];
  runnerCorrection: {
    sourcePath: string;
    sourceSha256: string;
    correctedPath: string;
    correctedSha256: string;
    diffPath: string;
    diffSha256: string;
    expectedMutationCount: 6;
    allOtherRunnerAssertionsUnchanged: true;
  };
  fixtureCounts: {
    check: 6;
    cancel: 7;
    weekday: 7;
    semanticLifecycle: 5;
    binding: 26;
    persistence: 12;
    totalFixtureRecords: 63;
    totalRunnerAssertions: 70;
  };
  initialImplementationAggregateSha256: string;
  completeV11InitialAggregateSha256: string;
};

export type VoiceVerifierV12AdversarialFreeze = {
  schemaVersion: "NITSYCLAW-VOICE-VERIFIER-V1.2-ADVERSARIAL-FREEZE";
  frozenOn: string;
  baseCommit: "eaff2ba5f223ec8ded19ae5d7c0f38bce3d0210e";
  immutableFiles: Array<{ role: string; path: string; sha256: string }>;
  initialImplementationFiles: Array<{ path: string; sha256: string }>;
  immutableAggregateSha256: string;
  initialImplementationAggregateSha256: string;
  completeInitialAggregateSha256: string;
};

const directory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(directory, "..", "..");
const corpusPath = join(directory, "voice-verifier-v1.2-adversarial-corpus.json");
const freezePath = join(directory, "voice-verifier-v1.2-adversarial.freeze.json");

const oldMutationBlock = `              for (const [index, mutation] of mutations.entries()) {
                expect(() => insertAttempt(db, \`\${fixture.id}-\${index}\`, fixture.accepted, mutation)).toThrow();
              }
              return;`;

const newMutationBlock = `              let rejectedMutations = 0;
              for (const [index, mutation] of mutations.entries()) {
                expect(() => insertAttempt(db, \`\${fixture.id}-\${index}\`, fixture.accepted, mutation)).toThrow();
                rejectedMutations++;
              }
              expect(rejectedMutations).toBe(mutations.length);
              expect(rejectedMutations).toBe(6);
              return;`;

const oldOuterAssertion = `        if (fixture.expectedRejected) expect(operation).toThrow();
        else expect(operation).not.toThrow();`;

const newOuterAssertion = `        if (fixture.operation === "mutate_each_binding_field") expect(operation).not.toThrow();
        else if (fixture.expectedRejected) expect(operation).toThrow();
        else expect(operation).not.toThrow();`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function voiceVerifierV12TextSha256(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n?/gu, "\n"), "utf8").digest("hex");
}

function aggregate(entries: ReadonlyArray<HashedFile>): string {
  const canonical = [...entries]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((entry) => `${entry.role ?? "implementation"}\0${entry.path}\0${entry.sha256}\n`)
    .join("");
  return voiceVerifierV12TextSha256(canonical);
}

function assertSafeRelativePath(path: string): void {
  if (!path || path.includes("..") || path.includes("\\") || path.startsWith("/")) {
    throw new Error(`V1.2 freeze path is invalid: ${path}`);
  }
}

async function verifyEntries(entries: ReadonlyArray<HashedFile>, label: string): Promise<void> {
  const paths = entries.map(({ path }) => path);
  assert(paths.length === new Set(paths).size, `${label} contains duplicate paths`);
  for (const entry of entries) {
    assertSafeRelativePath(entry.path);
    assert(/^[a-f0-9]{64}$/u.test(entry.sha256), `${label} hash is invalid: ${entry.path}`);
    const text = await readFile(join(repositoryRoot, ...entry.path.split("/")), "utf8");
    assert(voiceVerifierV12TextSha256(text) === entry.sha256, `${label} changed: ${entry.path}`);
  }
}

function replaceExactlyOnce(source: string, before: string, after: string, label: string): string {
  const first = source.indexOf(before);
  assert(first >= 0, `${label} source anchor missing`);
  assert(source.indexOf(before, first + before.length) < 0, `${label} source anchor duplicated`);
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

async function verifyAuthorizedRunnerCorrection(corpus: V12Corpus): Promise<void> {
  const source = (await readFile(join(repositoryRoot, ...corpus.runnerCorrection.sourcePath.split("/")), "utf8"))
    .replace(/\r\n?/gu, "\n");
  const corrected = (await readFile(join(repositoryRoot, ...corpus.runnerCorrection.correctedPath.split("/")), "utf8"))
    .replace(/\r\n?/gu, "\n");
  assert(voiceVerifierV12TextSha256(source) === corpus.runnerCorrection.sourceSha256, "V1.1 runner hash changed");
  assert(voiceVerifierV12TextSha256(corrected) === corpus.runnerCorrection.correctedSha256, "V1.2 runner hash changed");
  const recordedDiff = await readFile(
    join(repositoryRoot, ...corpus.runnerCorrection.diffPath.split("/")),
    "utf8",
  );
  assert(voiceVerifierV12TextSha256(recordedDiff) === corpus.runnerCorrection.diffSha256, "V1.2 runner diff changed");

  const expected = replaceExactlyOnce(
    replaceExactlyOnce(source, oldMutationBlock, newMutationBlock, "six-mutation block"),
    oldOuterAssertion,
    newOuterAssertion,
    "outer persistence assertion",
  );
  assert(corrected === expected, "V1.2 runner contains a change outside the single authorized correction");
  assert(corrected.includes("expect(rejectedMutations).toBe(mutations.length);"), "mutation evaluation count assertion missing");
  assert(corrected.includes("expect(rejectedMutations).toBe(6);"), "exact six-mutation assertion missing");
  assert(!corrected.includes(oldOuterAssertion), "contradictory outer assertion remains");
}

export async function validateVoiceVerifierV12Corpus(): Promise<Record<string, unknown>> {
  const corpus = JSON.parse(await readFile(corpusPath, "utf8")) as V12Corpus;
  assert(corpus.schemaVersion === "NITSYCLAW-VOICE-VERIFIER-V1.2-ADVERSARIAL-CORPUS", "V1.2 corpus schema invalid");
  assert(corpus.baseCommit === "eaff2ba5f223ec8ded19ae5d7c0f38bce3d0210e", "V1.2 base commit changed");
  assert(corpus.productionImplementationCommit === "be4cd77e9f800493907ebcd7ea76fbac4f8086ee", "production implementation commit changed");
  assert(corpus.voiceReleaseAuthorized === false, "V1.2 must not authorize voice release");
  assert(corpus.runnerCorrection.expectedMutationCount === 6, "mutation count changed");
  assert(corpus.runnerCorrection.allOtherRunnerAssertionsUnchanged === true, "runner correction scope changed");

  await verifyEntries(corpus.sharedImmutableInputs, "V1.2 shared immutable input");
  await verifyEntries(corpus.historicalEvidence, "V1.2 historical evidence");
  await verifyAuthorizedRunnerCorrection(corpus);
  const v11Validation = await validateVoiceVerifierV11AdversarialFreezeInputs();
  const counts = v11Validation.counts as Record<string, number>;
  assert(counts.check === corpus.fixtureCounts.check, "check fixture count changed");
  assert(counts.cancel === corpus.fixtureCounts.cancel, "cancel fixture count changed");
  assert(counts.weekday === corpus.fixtureCounts.weekday, "weekday fixture count changed");
  assert(counts.semanticLifecycle === corpus.fixtureCounts.semanticLifecycle, "semantic fixture count changed");
  assert(counts.binding === corpus.fixtureCounts.binding, "binding fixture count changed");
  assert(counts.persistence === corpus.fixtureCounts.persistence, "persistence fixture count changed");
  assert(counts.total === corpus.fixtureCounts.totalFixtureRecords, "total fixture count changed");
  const computedAssertions = counts.check + counts.cancel + counts.weekday + counts.semanticLifecycle
    + counts.binding + counts.persistence + 7;
  assert(computedAssertions === corpus.fixtureCounts.totalRunnerAssertions, "runner assertion count changed");

  const v1 = await verifyVoiceVerifierV1AdversarialFreeze();
  const v11 = await verifyVoiceVerifierV11AdversarialFreeze({ verifyInitialImplementation: true });
  assert(v11.initialImplementationAggregateSha256 === corpus.initialImplementationAggregateSha256, "production implementation aggregate changed");
  assert(v11.completeInitialAggregateSha256 === corpus.completeV11InitialAggregateSha256, "V1.1 complete aggregate changed");
  return {
    valid: true,
    historicalV1AggregateSha256: v1.completeInitialAggregateSha256,
    historicalV11AggregateSha256: v11.completeInitialAggregateSha256,
    fixtureCounts: corpus.fixtureCounts,
    sourceRunnerSha256: corpus.runnerCorrection.sourceSha256,
    correctedRunnerSha256: corpus.runnerCorrection.correctedSha256,
    sixMutationsExplicitlyCounted: true,
  };
}

export async function verifyVoiceVerifierV12AdversarialFreeze(options: {
  verifyInitialImplementation?: boolean;
} = {}): Promise<VoiceVerifierV12AdversarialFreeze> {
  await validateVoiceVerifierV12Corpus();
  const frozen = JSON.parse(await readFile(freezePath, "utf8")) as VoiceVerifierV12AdversarialFreeze;
  assert(frozen.schemaVersion === "NITSYCLAW-VOICE-VERIFIER-V1.2-ADVERSARIAL-FREEZE", "V1.2 freeze schema invalid");
  assert(frozen.baseCommit === "eaff2ba5f223ec8ded19ae5d7c0f38bce3d0210e", "V1.2 freeze base commit changed");
  const roles = new Set(frozen.immutableFiles.map(({ role }) => role));
  for (const required of ["corpus", "corrected_runner", "runner_diff", "freeze_verifier"]) {
    assert(roles.has(required), `V1.2 freeze role missing: ${required}`);
  }
  await verifyEntries(frozen.immutableFiles, "V1.2 immutable artifact");
  assert(aggregate(frozen.immutableFiles) === frozen.immutableAggregateSha256, "V1.2 immutable aggregate mismatch");
  assert(aggregate(frozen.initialImplementationFiles) === frozen.initialImplementationAggregateSha256, "V1.2 implementation aggregate metadata mismatch");
  const complete = voiceVerifierV12TextSha256(
    `${frozen.immutableAggregateSha256}\n${frozen.initialImplementationAggregateSha256}\n${frozen.baseCommit}\n`,
  );
  assert(complete === frozen.completeInitialAggregateSha256, "V1.2 complete initial aggregate mismatch");
  if (options.verifyInitialImplementation) {
    await verifyEntries(frozen.initialImplementationFiles, "V1.2 initial implementation");
  }
  return frozen;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const validateOnly = process.argv.includes("--validate-only");
  void (validateOnly
    ? validateVoiceVerifierV12Corpus()
    : verifyVoiceVerifierV12AdversarialFreeze({ verifyInitialImplementation: process.argv.includes("--initial") }))
    .then((result) => console.log(JSON.stringify({ validateOnly, ...result }, null, 2)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "V1.2 freeze verification failed.");
      process.exitCode = 1;
    });
}
