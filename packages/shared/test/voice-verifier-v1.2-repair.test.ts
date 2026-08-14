import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  createVoiceProposalTokenHashes,
  evaluateVoiceProposalBinding,
  verifyVoiceTranscript,
  type VoiceProposalConfirmationRequest,
  type VoiceProposalRecord,
  type VoiceSemanticLifecycle,
  type VoiceVerificationInput,
} from "../src/voice/index.js";

const ownerHash = "a".repeat(64);
const conversationHash = "b".repeat(64);
const policyVersion = "NITSYCLAW-VOICE-VERIFIER-V1";
const rawToken = "synthetic-repair-token";
const identity = { proposalId: "repair-proposal", ownerHash, conversationHash, policyVersion };
const hashes = createVoiceProposalTokenHashes(identity, rawToken);

function verify(rawTranscript: string, extensions: Partial<VoiceVerificationInput> = {}) {
  return verifyVoiceTranscript({
    rawTranscript,
    ownerHash,
    language: "english",
    providerConfidence: null,
    locale: "en-AU",
    contacts: [],
    products: [],
    ...extensions,
  });
}

function proposal(overrides: Partial<VoiceProposalRecord> = {}): VoiceProposalRecord {
  return {
    ...identity,
    ...hashes,
    status: "pending",
    expiresAtMs: 10_000,
    cancelledAtMs: null,
    usedAtMs: null,
    ...overrides,
  };
}

function request(accepted: boolean, overrides: Partial<VoiceProposalConfirmationRequest> = {}) {
  return { ...identity, rawToken, accepted, nowMs: 1_000, ...overrides };
}

describe("Voice Verifier V1.2 implementation repair", () => {
  it("keeps check typed and fail-closed when its object is ambiguous", () => {
    const quote = verify("Check the quote for this synthetic site.");
    expect(quote.actions.map(({ action }) => action)).toContain("check_quote");
    expect(quote.actions.map(({ action }) => action)).not.toContain("check");
    expect(quote.disposition).toBe("allow_local_preview");

    const ambiguous = verify("Check it.");
    expect(ambiguous.actions.map(({ action }) => action)).toContain("check");
    expect(ambiguous.tier).toBe(2);
    expect(ambiguous.disposition).toBe("require_text_clarification");
    expect(ambiguous.reasons).toContain("check_object_ambiguous");
    expect(ambiguous.externalActionAllowed).toBe(false);
  });

  it("separates cancellation intent from linguistic negation", () => {
    const direct = verify("Cancel proposal repair-proposal.");
    expect(direct.actions.map(({ action }) => action)).toContain("cancel");
    expect(direct.negated).toBe(false);
    expect(direct.tier).toBe(4);

    const negated = verify("Do not cancel proposal repair-proposal.");
    expect(negated.actions.map(({ action }) => action)).toContain("cancel");
    expect(negated.negated).toBe(true);
    expect(negated.externalActionAllowed).toBe(false);
  });

  it("resolves matching weekdays and rejects conflicts, stale context, and Sydney DST gaps", () => {
    const matching = verify("Schedule Monday 17/08/2026 at 10:00.");
    expect(matching.entities.find(({ raw }) => raw === "Monday")).toMatchObject({
      canonicalValue: "WEEKDAY|monday",
      resolution: "exact",
    });

    const conflict = verify("Schedule Tuesday 17/08/2026 at 10:00.");
    expect(conflict.entities.find(({ raw }) => raw === "Tuesday")).toMatchObject({
      canonicalValue: null,
      resolution: "rejected",
    });
    expect(conflict.reasons).toContain("weekday_date_conflict");

    const stale = verify("Book it for Monday.", {
      temporalContext: {
        anchorDate: "2026-08-12",
        version: "calendar-v1",
        currentVersion: "calendar-v2",
        timezone: "Australia/Sydney",
      },
    });
    expect(stale.entities.find(({ raw }) => raw === "Monday")?.resolution).toBe("rejected");
    expect(stale.reasons).toContain("temporal_context_stale");

    const gap = verify("Schedule Sunday 04/10/2026 at 2:30 a.m. Australia/Sydney.", {
      temporalContext: {
        anchorDate: "2026-08-12",
        version: "calendar-v1",
        currentVersion: "calendar-v1",
        timezone: "Australia/Sydney",
      },
    });
    expect(gap.entities.find(({ raw }) => raw === "2:30 a.m.")?.resolution).toBe("rejected");
    expect(gap.reasons).toContain("local_time_nonexistent");
  });

  it("fails closed for every semantic-verifier lifecycle terminal state", () => {
    const cases: Array<[VoiceSemanticLifecycle["state"], string, string]> = [
      ["timeout", "timeout", "semantic_timeout"],
      ["late_after_timeout", "late_rejected", "semantic_late_after_timeout"],
      ["cancelled", "cancelled_rejected", "semantic_after_cancellation"],
      ["previous_process", "restart_rejected", "semantic_after_restart"],
      ["partial", "partial_rejected", "semantic_partial_output"],
    ];
    for (const [state, status, reason] of cases) {
      const result = verify("Send the synthetic quote.", {
        semanticLifecycle: {
          state,
          requestId: `repair-${state}`,
          processEpoch: state === "previous_process" ? "epoch-old" : "epoch-current",
          currentProcessEpoch: "epoch-current",
        },
      });
      expect(result.semanticStatus).toBe(status);
      expect(result.reasons).toContain(reason);
      expect(result.disposition).not.toMatch(/^allow_/u);
      expect(result.externalActionAllowed).toBe(false);
    }
    const incomplete = verify("Check the synthetic quote.", {
      semanticLifecycle: { state: "timeout" } as VoiceSemanticLifecycle,
    });
    expect(incomplete.semanticStatus).toBe("partial_rejected");
    expect(incomplete.reasons).toContain("semantic_partial_output");
  });

  it("binds tokens to the complete identity and rejects all mismatches for accepted false and true", () => {
    expect(hashes).toEqual({
      tokenHash: "494bbe3e50edc201354afd78f70bea35e1b85a8d2ade545739a7da1575c9f9a2",
      tokenBindingHash: "382f644d0ee87306214f6f3194fefe0e78057a539e0a553b9b5e3ed61294487b",
    });
    const mismatches: Array<Partial<VoiceProposalConfirmationRequest>> = [
      { proposalId: "other-proposal" },
      { ownerHash: "c".repeat(64) },
      { conversationHash: "d".repeat(64) },
      { policyVersion: "NITSYCLAW-VOICE-VERIFIER-V0" },
      { rawToken: "other-token" },
    ];
    for (const accepted of [false, true]) {
      for (const mismatch of mismatches) {
        const result = evaluateVoiceProposalBinding(proposal(), request(accepted, mismatch));
        expect(result.bindingValid).toBe(false);
        expect(result.confirmationUsable).toBe(false);
        expect(result.externalActionAllowed).toBe(false);
      }
    }
  });

  it("rejects expiry, cancellation, replay, completed state, and state restored after restart", () => {
    const cases: Array<[VoiceProposalRecord, string]> = [
      [proposal({ expiresAtMs: 1_000 }), "expired"],
      [proposal({ status: "cancelled", cancelledAtMs: 900 }), "cancelled"],
      [proposal({ usedAtMs: 900 }), "used"],
      [proposal({ status: "completed" }), "state_not_pending"],
    ];
    for (const [stored, reason] of cases) {
      expect(evaluateVoiceProposalBinding(structuredClone(stored), request(true))).toMatchObject({
        bindingValid: false,
        confirmationUsable: false,
        externalActionAllowed: false,
        reason,
      });
    }
    expect(evaluateVoiceProposalBinding(proposal(), request(false))).toMatchObject({
      bindingValid: true,
      confirmationUsable: false,
      externalActionAllowed: false,
      reason: "not_accepted",
    });
    expect(evaluateVoiceProposalBinding(proposal(), request(true))).toMatchObject({
      bindingValid: true,
      confirmationUsable: true,
      externalActionAllowed: false,
      reason: "matched",
    });
  });

  it("keeps deterministic verification under the frozen latency ceiling with zero external authority", () => {
    const durations: number[] = [];
    let authorityCount = 0;
    for (let repeat = 0; repeat < 200; repeat++) {
      const started = performance.now();
      const result = verify(repeat % 2 === 0 ? "Check it." : "Cancel proposal repair-proposal.");
      durations.push(performance.now() - started);
      if (result.externalActionAllowed) authorityCount++;
    }
    durations.sort((left, right) => left - right);
    expect(durations[Math.ceil(durations.length * 0.95) - 1]).toBeLessThanOrEqual(250);
    expect(authorityCount).toBe(0);
  });
});

const sqliteMigration = `
PRAGMA foreign_keys = ON;
CREATE TABLE voice_verification_proposals (
  proposal_id TEXT NOT NULL,
  owner_hash TEXT NOT NULL CHECK(length(owner_hash) = 64),
  conversation_hash TEXT NOT NULL CHECK(length(conversation_hash) = 64),
  policy_version TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash) = 64),
  token_binding_hash TEXT NOT NULL UNIQUE CHECK(length(token_binding_hash) = 64),
  status TEXT NOT NULL CHECK(status IN ('pending', 'completed', 'cancelled', 'expired')),
  expires_at_ms INTEGER NOT NULL,
  cancelled_at_ms INTEGER,
  used_at_ms INTEGER,
  PRIMARY KEY (proposal_id, owner_hash, conversation_hash, policy_version),
  UNIQUE (proposal_id, owner_hash, conversation_hash, policy_version, token_hash, token_binding_hash)
);
CREATE TABLE voice_verification_confirmations (
  attempt_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  owner_hash TEXT NOT NULL,
  conversation_hash TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  token_binding_hash TEXT NOT NULL,
  accepted INTEGER NOT NULL CHECK(accepted IN (0, 1)),
  FOREIGN KEY (proposal_id, owner_hash, conversation_hash, policy_version, token_hash, token_binding_hash)
    REFERENCES voice_verification_proposals
      (proposal_id, owner_hash, conversation_hash, policy_version, token_hash, token_binding_hash)
);
CREATE UNIQUE INDEX voice_verification_confirmations_accepted_once_idx
  ON voice_verification_confirmations
    (proposal_id, owner_hash, conversation_hash, policy_version, token_hash, token_binding_hash)
  WHERE accepted = 1;
`;

function insertSqliteProposal(db: DatabaseSync, values: Partial<Record<string, string | number | null>> = {}) {
  const row = {
    proposal_id: identity.proposalId,
    owner_hash: ownerHash,
    conversation_hash: conversationHash,
    policy_version: policyVersion,
    token_hash: hashes.tokenHash,
    token_binding_hash: hashes.tokenBindingHash,
    status: "pending",
    expires_at_ms: 10_000,
    cancelled_at_ms: null,
    used_at_ms: null,
    ...values,
  };
  db.prepare(`INSERT INTO voice_verification_proposals VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    row.proposal_id, row.owner_hash, row.conversation_hash, row.policy_version,
    row.token_hash, row.token_binding_hash, row.status, row.expires_at_ms,
    row.cancelled_at_ms, row.used_at_ms,
  );
}

function insertSqliteConfirmation(
  db: DatabaseSync,
  attemptId: string,
  accepted: 0 | 1,
  values: Partial<Record<string, string>> = {},
) {
  const row = {
    proposal_id: identity.proposalId,
    owner_hash: ownerHash,
    conversation_hash: conversationHash,
    policy_version: policyVersion,
    token_hash: hashes.tokenHash,
    token_binding_hash: hashes.tokenBindingHash,
    ...values,
  };
  db.prepare(`INSERT INTO voice_verification_confirmations VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    attemptId, row.proposal_id, row.owner_hash, row.conversation_hash,
    row.policy_version, row.token_hash, row.token_binding_hash, accepted,
  );
}

describe("Voice proposal-binding migration semantics in disposable databases", () => {
  it("keeps production migration, schema, and all repository paths on the same complete identity", () => {
    const migration = readFileSync("packages/shared/drizzle/0012_voice_proposal_binding.sql", "utf8");
    const schema = readFileSync("packages/shared/src/db/schema.ts", "utf8");
    const repo = readFileSync("packages/shared/src/db/repo.ts", "utf8");
    expect(schema).toContain("voiceVerificationProposals");
    expect(schema).toContain("voiceVerificationConfirmations");
    expect(migration).toMatch(/UNIQUE\s*\(\s*"token_hash"\s*\)/u);
    expect(migration).toContain("voice_verification_confirmations_accepted_once_idx");
    expect(migration).toMatch(/FOREIGN KEY[\s\S]*"proposal_id"[\s\S]*"owner_hash"[\s\S]*"conversation_hash"[\s\S]*"policy_version"[\s\S]*"token_hash"[\s\S]*"token_binding_hash"/u);
    for (const name of [
      "insertVoiceVerificationProposal",
      "getVoiceVerificationProposal",
      "recordVoiceVerificationConfirmation",
      "cancelVoiceVerificationProposal",
      "expireVoiceVerificationProposal",
      "consumeVoiceVerificationProposal",
    ]) {
      const start = repo.indexOf(`export async function ${name}`);
      const end = repo.indexOf("\nexport async function ", start + 1);
      const body = repo.slice(start, end < 0 ? repo.length : end);
      expect(start, name).toBeGreaterThanOrEqual(0);
      for (const field of ["proposalId", "ownerHash", "conversationHash", "policyVersion", "tokenHash", "tokenBindingHash"]) {
        expect(body, `${name}: ${field}`).toContain(field);
      }
    }
    const consumeStart = repo.indexOf("export async function consumeVoiceVerificationProposal");
    const consume = repo.slice(consumeStart, repo.indexOf("\nexport async function ", consumeStart + 1));
    expect(consume).toContain("voiceVerificationConfirmations.accepted, true");
  });

  it("rejects every identity mutation for accepted zero and one and prevents cross-tenant replay", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(sqliteMigration);
      insertSqliteProposal(db);
      insertSqliteConfirmation(db, "matching-0", 0);
      insertSqliteConfirmation(db, "matching-1", 1);
      expect(() => insertSqliteConfirmation(db, "matching-1-replay", 1)).toThrow();
      expect(() => insertSqliteConfirmation(db, "matching-0-repeat", 0)).not.toThrow();
      const mutations = [
        { proposal_id: "other-proposal" },
        { owner_hash: "c".repeat(64) },
        { conversation_hash: "d".repeat(64) },
        { policy_version: "other-policy" },
        { token_hash: "e".repeat(64) },
        { token_binding_hash: "f".repeat(64) },
      ];
      for (const accepted of [0, 1] as const) {
        for (const [index, mutation] of mutations.entries()) {
          expect(() => insertSqliteConfirmation(db, `mismatch-${accepted}-${index}`, accepted, mutation)).toThrow();
        }
      }
      expect(() => insertSqliteProposal(db, {
        proposal_id: "tenant-replay",
        owner_hash: "c".repeat(64),
        conversation_hash: "d".repeat(64),
        token_binding_hash: "e".repeat(64),
      })).toThrow();
    } finally {
      db.close();
    }
  });

  it("proves transactional failure rollback and restart persistence without runtime data", () => {
    const directory = mkdtempSync(join(tmpdir(), "nitsyclaw-voice-binding-"));
    const path = join(directory, "disposable.sqlite");
    try {
      let db = new DatabaseSync(path);
      db.exec("CREATE TABLE preexisting_sentinel (id INTEGER PRIMARY KEY)");
      db.exec(sqliteMigration);
      db.exec("BEGIN");
      try {
        insertSqliteProposal(db);
        insertSqliteConfirmation(db, "rollback-valid", 1);
        insertSqliteConfirmation(db, "rollback-invalid", 1, { owner_hash: "c".repeat(64) });
        db.exec("COMMIT");
      } catch {
        db.exec("ROLLBACK");
      }
      expect((db.prepare("SELECT count(*) AS count FROM voice_verification_proposals").get() as { count: number }).count).toBe(0);
      insertSqliteProposal(db);
      insertSqliteConfirmation(db, "persisted-0", 0);
      db.close();

      db = new DatabaseSync(path);
      expect((db.prepare("SELECT count(*) AS count FROM voice_verification_proposals").get() as { count: number }).count).toBe(1);
      expect((db.prepare("SELECT accepted FROM voice_verification_confirmations WHERE attempt_id = ?").get("persisted-0") as { accepted: number }).accepted).toBe(0);
      expect((db.prepare("SELECT count(*) AS count FROM preexisting_sentinel").get() as { count: number }).count).toBe(0);
      db.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
