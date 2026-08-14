import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import fixtures from "./voice-verifier-v1.1-adversarial-fixtures.json";
import thresholds from "./voice-verifier-v1.1-adversarial-thresholds.json";

const directory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(directory, "..", "..");

const expectedIds = {
  checkCases: [
    "check-direct-quote",
    "check-negated-quote",
    "check-quoted-background",
    "check-ambiguous-object",
    "check-roman-hinglish-quote",
    "check-devanagari-hinglish-quote",
  ],
  cancelCases: [
    "cancel-pending-proposal",
    "cancel-completed-proposal",
    "cancel-unknown-proposal",
    "cancel-negated",
    "cancel-quoted-background",
    "cancel-other-owner",
    "cancel-other-conversation",
  ],
  weekdayCases: [
    "weekday-alone-no-anchor",
    "weekday-plus-date",
    "weekday-date-matching",
    "weekday-date-conflicting",
    "weekday-dst-nonexistent-sydney",
    "weekday-stale-context",
    "weekday-australian-locale",
  ],
  semanticTimeoutCases: [
    "semantic-timeout",
    "semantic-late-after-timeout",
    "semantic-after-cancellation",
    "semantic-after-restart",
    "semantic-partial-output",
  ],
  persistenceCases: [
    "db-correct-accepted-0",
    "db-correct-accepted-1",
    "db-wrong-owner-accepted-0",
    "db-wrong-owner-accepted-1",
    "db-wrong-conversation-accepted-0",
    "db-wrong-conversation-accepted-1",
    "db-wrong-owner-conversation-accepted-0",
    "db-wrong-owner-conversation-accepted-1",
    "db-copied-row-owner",
    "db-copied-row-conversation",
    "db-duplicate-token-cross-tenant",
    "db-token-binding-all-identity-fields",
  ],
} as const;

const pairedBindingMutations = [
  "none",
  "wrong_proposal",
  "wrong_owner",
  "wrong_conversation",
  "wrong_owner_conversation",
  "wrong_policy",
  "wrong_token",
  "expired",
  "cancelled",
  "used",
  "completed",
  "replay_owner_mutation",
  "replay_conversation_mutation",
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n?/gu, "\n"), "utf8").digest("hex");
}

function rawSha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function bindingHash(identity: {
  proposalId: string;
  ownerHash: string;
  conversationHash: string;
  policyVersion: string;
}, rawToken: string): string {
  return rawSha256([
    "NITSYCLAW-VOICE-PROPOSAL-BINDING-V1",
    identity.proposalId,
    identity.ownerHash,
    identity.conversationHash,
    identity.policyVersion,
    rawToken,
  ].join("\0"));
}

function assertExactIds(
  key: keyof typeof expectedIds,
  cases: ReadonlyArray<{ id: string }>,
): void {
  const expected = [...expectedIds[key]].sort();
  const actual = cases.map(({ id }) => id).sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${key} exact case set changed`);
}

function assertIsoDateWeekday(date: string, expectedWeekday: number, label: string): void {
  const [year, month, day] = date.split("-").map(Number);
  assert(Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day), `${label}: date invalid`);
  assert(new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay() === expectedWeekday, `${label}: weekday contradiction`);
}

function insertBaseProposal(db: DatabaseSync, overrides: Partial<Record<string, unknown>> = {}): void {
  const base = fixtures.bindingBase;
  const row = {
    proposal_id: base.proposalId,
    owner_hash: base.ownerHash,
    conversation_hash: base.conversationHash,
    policy_version: base.policyVersion,
    token_hash: base.tokenHash,
    token_binding_hash: base.tokenBindingHash,
    status: base.status,
    expires_at_ms: base.expiresAtMs,
    cancelled_at_ms: base.cancelledAtMs,
    used_at_ms: base.usedAtMs,
    created_at_ms: 0,
    ...overrides,
  };
  db.prepare(`INSERT INTO voice_v11_proposals (
    proposal_id, owner_hash, conversation_hash, policy_version, token_hash,
    token_binding_hash, status, expires_at_ms, cancelled_at_ms, used_at_ms, created_at_ms
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    row.proposal_id,
    row.owner_hash,
    row.conversation_hash,
    row.policy_version,
    row.token_hash,
    row.token_binding_hash,
    row.status,
    row.expires_at_ms,
    row.cancelled_at_ms,
    row.used_at_ms,
    row.created_at_ms,
  );
}

function validateIsolatedSchema(schemaText: string): void {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(schemaText);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
      .map((row) => String((row as { name: unknown }).name));
    assert(tables.join(",") === "voice_v11_confirmation_attempts,voice_v11_proposals", "isolated schema tables invalid");
    const foreignKeys = db.prepare("PRAGMA foreign_key_list('voice_v11_confirmation_attempts')").all()
      .map((row) => String((row as { from: unknown }).from));
    assert([
      "proposal_id",
      "owner_hash",
      "conversation_hash",
      "policy_version",
      "token_hash",
      "token_binding_hash",
    ].every((column) => foreignKeys.includes(column)), "isolated schema composite foreign key incomplete");

    insertBaseProposal(db);
    const insertAttempt = db.prepare(`INSERT INTO voice_v11_confirmation_attempts (
      attempt_id, proposal_id, owner_hash, conversation_hash, policy_version,
      token_hash, token_binding_hash, accepted, created_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertAttempt.run(
      "validator-accepted-0",
      fixtures.bindingBase.proposalId,
      fixtures.bindingBase.ownerHash,
      fixtures.bindingBase.conversationHash,
      fixtures.bindingBase.policyVersion,
      fixtures.bindingBase.tokenHash,
      fixtures.bindingBase.tokenBindingHash,
      0,
      1,
    );
    insertAttempt.run(
      "validator-accepted-1",
      fixtures.bindingBase.proposalId,
      fixtures.bindingBase.ownerHash,
      fixtures.bindingBase.conversationHash,
      fixtures.bindingBase.policyVersion,
      fixtures.bindingBase.tokenHash,
      fixtures.bindingBase.tokenBindingHash,
      1,
      2,
    );
    for (const accepted of [0, 1]) {
      assertThrows(() => insertAttempt.run(
        `validator-wrong-owner-${accepted}`,
        fixtures.bindingBase.proposalId,
        "c".repeat(64),
        fixtures.bindingBase.conversationHash,
        fixtures.bindingBase.policyVersion,
        fixtures.bindingBase.tokenHash,
        fixtures.bindingBase.tokenBindingHash,
        accepted,
        3 + accepted,
      ), `wrong owner accepted=${accepted} must violate the composite foreign key`);
    }
  } finally {
    db.close();
  }
}

function assertThrows(operation: () => unknown, message: string): void {
  let threw = false;
  try {
    operation();
  } catch {
    threw = true;
  }
  assert(threw, message);
}

export async function validateVoiceVerifierV11AdversarialFreezeInputs(): Promise<Record<string, unknown>> {
  assert(fixtures.schemaVersion === "NITSYCLAW-VOICE-VERIFIER-V1.1-ADVERSARIAL-FIXTURES", "fixture schema invalid");
  assert(fixtures.syntheticOnly === true, "fixtures must be synthetic only");
  assert(fixtures.frozenAgainstCommit === "be4cd77e9f800493907ebcd7ea76fbac4f8086ee", "initial commit changed");
  assert(thresholds.schemaVersion === "NITSYCLAW-VOICE-VERIFIER-V1.1-ADVERSARIAL-THRESHOLDS", "threshold schema invalid");
  for (const [key, value] of Object.entries(thresholds)) {
    if (key === "schemaVersion" || key === "deterministicP95MsMax") continue;
    assert(value === 0 || value === 1, `threshold ${key} must remain zero or one`);
  }
  assert(thresholds.deterministicP95MsMax === 250, "p95 threshold must remain 250 ms");

  assertExactIds("checkCases", fixtures.checkCases);
  assertExactIds("cancelCases", fixtures.cancelCases);
  assertExactIds("weekdayCases", fixtures.weekdayCases);
  assertExactIds("semanticTimeoutCases", fixtures.semanticTimeoutCases);
  assertExactIds("persistenceCases", fixtures.persistenceCases);

  const allIds = [
    ...fixtures.checkCases,
    ...fixtures.cancelCases,
    ...fixtures.weekdayCases,
    ...fixtures.semanticTimeoutCases,
    ...fixtures.bindingCases,
    ...fixtures.persistenceCases,
  ].map(({ id }) => id);
  assert(allIds.length === new Set(allIds).size, "fixture IDs must be globally unique");
  assert(allIds.every((id) => /^[a-z0-9][a-z0-9-]+$/u.test(id)), "fixture IDs must be stable kebab-case");

  assert(fixtures.checkCases.filter(({ expected }) => expected.outcome === "allowed").length === 3, "safe check count changed");
  assert(fixtures.checkCases.filter(({ expected }) => expected.outcome === "blocked").length === 3, "unsafe check count changed");
  assert(fixtures.cancelCases.every(({ expected }) => expected.outcome === "blocked"), "every cancel fixture must be blocked");
  assert(fixtures.weekdayCases.every(({ expected }) => expected.outcome === "blocked"), "every weekday fixture must block execution");
  assert(fixtures.semanticTimeoutCases.every(({ expected }) => expected.outcome === "blocked"), "every semantic lifecycle failure must block");

  assertIsoDateWeekday("2026-08-17", 1, "Monday 17/08/2026");
  assertIsoDateWeekday("2026-10-04", 0, "Sunday 04/10/2026");
  const conflict = fixtures.weekdayCases.find(({ id }) => id === "weekday-date-conflicting");
  assert(conflict?.expected.weekdayRaw === "Tuesday" && conflict.expected.dateCanonical === "2026-08-17", "conflict fixture changed");
  const dst = fixtures.weekdayCases.find(({ id }) => id === "weekday-dst-nonexistent-sydney");
  assert(dst?.expected.reason === "local_time_nonexistent", "DST fixture must reject the Sydney spring-forward gap");

  const base = fixtures.bindingBase;
  assert(/^[a-f0-9]{64}$/u.test(base.ownerHash) && /^[a-f0-9]{64}$/u.test(base.conversationHash), "base identity hashes invalid");
  assert(rawSha256(base.rawToken) === base.tokenHash, "raw token hash contradiction");
  assert(bindingHash(base, base.rawToken) === base.tokenBindingHash, "token binding hash contradiction");
  assert(base.status === "pending" && base.expiresAtMs > base.nowMs && base.cancelledAtMs === null && base.usedAtMs === null, "base proposal must be pending, unexpired, uncancelled, and unused");

  for (const mutation of pairedBindingMutations) {
    const matching = fixtures.bindingCases.filter((fixture) => fixture.mutation === mutation);
    assert(matching.length === 2, `${mutation}: accepted matrix must contain exactly two variants`);
    assert(new Set(matching.map(({ accepted }) => accepted)).size === 2, `${mutation}: accepted=0 and accepted=1 both required`);
  }
  const mismatches = fixtures.bindingCases.filter(({ mutation }) => mutation !== "none");
  assert(mismatches.every(({ expected }) => expected.bindingValid === false && expected.confirmationUsable === false), "every mismatch must reject");
  assert(fixtures.bindingCases.every(({ expected }) => !("externalActionAllowed" in expected)), "fixtures must not encode execution authority");
  assert(fixtures.requiredRepositoryPaths.length === 6 && new Set(fixtures.requiredRepositoryPaths).size === 6, "repository path list incomplete");

  const schemaText = await readFile(join(directory, "voice-verifier-v1.1-adversarial-db-schema.sql"), "utf8");
  validateIsolatedSchema(schemaText);
  const fixtureText = await readFile(join(directory, "voice-verifier-v1.1-adversarial-fixtures.json"), "utf8");
  const thresholdText = await readFile(join(directory, "voice-verifier-v1.1-adversarial-thresholds.json"), "utf8");
  const specText = await readFile(join(repositoryRoot, "docs", "voice-verifier-v1.1-adversarial-spec.md"), "utf8");

  return {
    valid: true,
    counts: {
      check: fixtures.checkCases.length,
      cancel: fixtures.cancelCases.length,
      weekday: fixtures.weekdayCases.length,
      semanticLifecycle: fixtures.semanticTimeoutCases.length,
      binding: fixtures.bindingCases.length,
      persistence: fixtures.persistenceCases.length,
      total: allIds.length,
    },
    bindingAcceptedZeroMismatchCases: mismatches.filter(({ accepted }) => accepted === 0).length,
    bindingAcceptedOneMismatchCases: mismatches.filter(({ accepted }) => accepted === 1).length,
    hashes: {
      specification: sha256(specText),
      fixtures: sha256(fixtureText),
      thresholds: sha256(thresholdText),
      isolatedDatabaseSchema: sha256(schemaText),
      tokenHash: base.tokenHash,
      tokenBindingHash: base.tokenBindingHash,
    },
    repositoryRoot,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void validateVoiceVerifierV11AdversarialFreezeInputs()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "V1.1 adversarial fixture validation failed.");
      process.exitCode = 1;
    });
}
