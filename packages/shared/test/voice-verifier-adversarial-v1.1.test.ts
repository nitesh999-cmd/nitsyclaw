import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import fixturesJson from "../../../scripts/voice-eval/voice-verifier-v1.1-adversarial-fixtures.json";
import thresholds from "../../../scripts/voice-eval/voice-verifier-v1.1-adversarial-thresholds.json";
import { verifyVoiceVerifierV1AdversarialFreeze } from "../../../scripts/voice-eval/verify-voice-verifier-v1-adversarial-freeze.js";
import { verifyVoiceVerifierV11AdversarialFreeze } from "../../../scripts/voice-eval/verify-voice-verifier-v1.1-adversarial-freeze.js";
import {
  formatVoiceVerifierBlock,
  verifyVoiceTranscript,
  type VoiceLanguage,
  type VoiceVerificationDisposition,
  type VoiceVerificationInput,
  type VoiceVerificationResult,
} from "../src/voice/index.js";

type CommonExpected = {
  outcome: "allowed" | "blocked";
  action: string;
  tier: number;
  disposition: VoiceVerificationDisposition;
  negated: boolean;
  authority: string;
  reason?: string;
};

type CheckCase = {
  id: string;
  rawTranscript: string;
  language: VoiceLanguage;
  locale: VoiceVerificationInput["locale"];
  expected: CommonExpected;
};

type CancelCase = {
  id: string;
  rawTranscript: string;
  proposalState: "pending" | "completed" | "missing";
  identity: "matching" | "wrong_owner" | "wrong_conversation";
  expectedBindingReason: string;
  expected: CommonExpected;
};

type TemporalContext = {
  anchorDate: string;
  version: string;
  currentVersion: string;
  timezone: string;
};

type WeekdayCase = {
  id: string;
  rawTranscript: string;
  language: VoiceLanguage;
  locale: VoiceVerificationInput["locale"];
  temporalContext?: TemporalContext;
  expected: {
    outcome: "blocked";
    action: string;
    tier: number;
    weekdayRaw: string;
    weekdayCanonical: string | null;
    weekdayResolution: string;
    dateRaw?: string;
    dateCanonical?: string;
    timeRaw?: string;
    timeResolution?: string;
    reason?: string;
  };
};

type SemanticCase = {
  id: string;
  rawTranscript: string;
  lifecycle: Record<string, string>;
  expected: {
    status: string;
    reason: string;
    outcome: "blocked";
    baselineTier: number;
  };
};

type BindingMutation =
  | "none"
  | "wrong_proposal"
  | "wrong_owner"
  | "wrong_conversation"
  | "wrong_owner_conversation"
  | "wrong_policy"
  | "wrong_token"
  | "expired"
  | "cancelled"
  | "used"
  | "completed"
  | "replay_owner_mutation"
  | "replay_conversation_mutation";

type BindingCase = {
  id: string;
  accepted: 0 | 1;
  mutation: BindingMutation;
  expected: { bindingValid: boolean; confirmationUsable: boolean; reason: string };
};

type PersistenceCase = {
  id: string;
  operation: string;
  accepted: 0 | 1;
  expectedRejected: boolean;
};

type BindingBase = {
  proposalId: string;
  ownerHash: string;
  conversationHash: string;
  policyVersion: string;
  rawToken: string;
  tokenHash: string;
  tokenBindingHash: string;
  status: "pending" | "completed" | "cancelled" | "expired";
  expiresAtMs: number;
  cancelledAtMs: number | null;
  usedAtMs: number | null;
  nowMs: number;
};

type Corpus = {
  checkCases: CheckCase[];
  cancelCases: CancelCase[];
  weekdayCases: WeekdayCase[];
  semanticTimeoutCases: SemanticCase[];
  bindingBase: BindingBase;
  bindingCases: BindingCase[];
  persistenceCases: PersistenceCase[];
  requiredRepositoryPaths: string[];
};

type ProposalIdentity = {
  proposalId: string;
  ownerHash: string;
  conversationHash: string;
  policyVersion: string;
};

type ProposalRecord = ProposalIdentity & {
  tokenHash: string;
  tokenBindingHash: string;
  status: "pending" | "completed" | "cancelled" | "expired";
  expiresAtMs: number;
  cancelledAtMs: number | null;
  usedAtMs: number | null;
};

type ProposalRequest = ProposalIdentity & {
  rawToken: string;
  accepted: boolean;
  nowMs: number;
};

type ProposalBindingResult = {
  bindingValid: boolean;
  confirmationUsable: boolean;
  externalActionAllowed: false;
  reason: string;
};

type BindingModule = {
  createVoiceProposalTokenHashes: (identity: ProposalIdentity, rawToken: string) => {
    tokenHash: string;
    tokenBindingHash: string;
  };
  evaluateVoiceProposalBinding: (
    proposal: ProposalRecord | null,
    request: ProposalRequest,
  ) => ProposalBindingResult;
};

const corpus = fixturesJson as unknown as Corpus;
const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(testDirectory, "..", "..", "..");
const sqliteSchema = readFileSync(
  join(repositoryRoot, "scripts", "voice-eval", "voice-verifier-v1.1-adversarial-db-schema.sql"),
  "utf8",
);
const bindingModulePath = join(repositoryRoot, "packages", "shared", "src", "voice", "proposal-binding.ts");
const migrationPath = join(repositoryRoot, "packages", "shared", "drizzle", "0012_voice_proposal_binding.sql");
const blockedDispositions = new Set<VoiceVerificationDisposition>([
  "require_text_clarification",
  "require_text_confirmation",
  "require_text_restatement",
  "reject",
]);
const allowedDispositions = new Set<VoiceVerificationDisposition>([
  "allow_transcript",
  "allow_conversation",
  "allow_local_preview",
]);

let bindingModulePromise: Promise<BindingModule> | undefined;

function bindingModule(): Promise<BindingModule> {
  bindingModulePromise ??= import(pathToFileURL(bindingModulePath).href) as Promise<BindingModule>;
  return bindingModulePromise;
}

function verifyText(
  rawTranscript: string,
  language: VoiceLanguage = "english",
  locale: VoiceVerificationInput["locale"] = "en-AU",
  extensions: Record<string, unknown> = {},
): VoiceVerificationResult {
  return verifyVoiceTranscript({
    rawTranscript,
    ownerHash: "a".repeat(64),
    language,
    providerConfidence: null,
    locale,
    contacts: [],
    products: [],
    ...extensions,
  } as VoiceVerificationInput);
}

function expectBlocked(result: VoiceVerificationResult): void {
  expect(blockedDispositions.has(result.disposition)).toBe(true);
  expect(result.externalActionAllowed).toBe(false);
  expect(result.tierPolicy.externalActionAllowed).toBe(false);
  expect(result.tierPolicy.voiceConfirmationSufficient).toBe(false);
  expect(result.tierPolicy.survivesRestart).toBe(false);
}

function expectCommon(result: VoiceVerificationResult, expected: CommonExpected): void {
  expect(result.actions.map(({ action }) => action)).toContain(expected.action);
  expect(result.tier).toBe(expected.tier);
  expect(result.disposition).toBe(expected.disposition);
  expect(result.negated).toBe(expected.negated);
  expect(result.authority).toBe(expected.authority);
  expect(result.externalActionAllowed).toBe(false);
  if (expected.outcome === "blocked") expectBlocked(result);
  else expect(allowedDispositions.has(result.disposition)).toBe(true);
  if (expected.reason) expect(result.reasons).toContain(expected.reason);
}

function baseProposal(): ProposalRecord {
  return {
    proposalId: corpus.bindingBase.proposalId,
    ownerHash: corpus.bindingBase.ownerHash,
    conversationHash: corpus.bindingBase.conversationHash,
    policyVersion: corpus.bindingBase.policyVersion,
    tokenHash: corpus.bindingBase.tokenHash,
    tokenBindingHash: corpus.bindingBase.tokenBindingHash,
    status: corpus.bindingBase.status,
    expiresAtMs: corpus.bindingBase.expiresAtMs,
    cancelledAtMs: corpus.bindingBase.cancelledAtMs,
    usedAtMs: corpus.bindingBase.usedAtMs,
  };
}

function baseRequest(accepted: 0 | 1): ProposalRequest {
  return {
    proposalId: corpus.bindingBase.proposalId,
    ownerHash: corpus.bindingBase.ownerHash,
    conversationHash: corpus.bindingBase.conversationHash,
    policyVersion: corpus.bindingBase.policyVersion,
    rawToken: corpus.bindingBase.rawToken,
    accepted: accepted === 1,
    nowMs: corpus.bindingBase.nowMs,
  };
}

function mutatedBinding(fixture: BindingCase): { proposal: ProposalRecord; request: ProposalRequest } {
  const proposal = baseProposal();
  const request = baseRequest(fixture.accepted);
  switch (fixture.mutation) {
    case "none": break;
    case "wrong_proposal": request.proposalId = "proposal-v11-beta"; break;
    case "wrong_owner":
    case "replay_owner_mutation": request.ownerHash = "c".repeat(64); break;
    case "wrong_conversation":
    case "replay_conversation_mutation": request.conversationHash = "d".repeat(64); break;
    case "wrong_owner_conversation":
      request.ownerHash = "c".repeat(64);
      request.conversationHash = "d".repeat(64);
      break;
    case "wrong_policy": request.policyVersion = "NITSYCLAW-VOICE-VERIFIER-V0"; break;
    case "wrong_token": request.rawToken = "synthetic-v11-token-other"; break;
    case "expired": proposal.expiresAtMs = corpus.bindingBase.nowMs - 1; break;
    case "cancelled":
      proposal.status = "cancelled";
      proposal.cancelledAtMs = corpus.bindingBase.nowMs - 1;
      break;
    case "used": proposal.usedAtMs = corpus.bindingBase.nowMs - 1; break;
    case "completed": proposal.status = "completed"; break;
  }
  return { proposal, request };
}

function openDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(sqliteSchema);
  return db;
}

function insertProposal(db: DatabaseSync, overrides: Partial<Record<string, unknown>> = {}): void {
  const row = {
    proposal_id: corpus.bindingBase.proposalId,
    owner_hash: corpus.bindingBase.ownerHash,
    conversation_hash: corpus.bindingBase.conversationHash,
    policy_version: corpus.bindingBase.policyVersion,
    token_hash: corpus.bindingBase.tokenHash,
    token_binding_hash: corpus.bindingBase.tokenBindingHash,
    status: corpus.bindingBase.status,
    expires_at_ms: corpus.bindingBase.expiresAtMs,
    cancelled_at_ms: corpus.bindingBase.cancelledAtMs,
    used_at_ms: corpus.bindingBase.usedAtMs,
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

function insertAttempt(
  db: DatabaseSync,
  attemptId: string,
  accepted: 0 | 1,
  overrides: Partial<Record<string, unknown>> = {},
): void {
  const row = {
    proposal_id: corpus.bindingBase.proposalId,
    owner_hash: corpus.bindingBase.ownerHash,
    conversation_hash: corpus.bindingBase.conversationHash,
    policy_version: corpus.bindingBase.policyVersion,
    token_hash: corpus.bindingBase.tokenHash,
    token_binding_hash: corpus.bindingBase.tokenBindingHash,
    ...overrides,
  };
  db.prepare(`INSERT INTO voice_v11_confirmation_attempts (
    attempt_id, proposal_id, owner_hash, conversation_hash, policy_version,
    token_hash, token_binding_hash, accepted, created_at_ms
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    attemptId,
    row.proposal_id,
    row.owner_hash,
    row.conversation_hash,
    row.policy_version,
    row.token_hash,
    row.token_binding_hash,
    accepted,
    1,
  );
}

function functionSource(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  if (start < 0) return "";
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

describe("Voice Verifier V1.1 freeze integrity", () => {
  it("keeps the new corpus independent and immutable", async () => {
    const frozen = await verifyVoiceVerifierV11AdversarialFreeze();
    expect(frozen.initialCommit).toBe("be4cd77e9f800493907ebcd7ea76fbac4f8086ee");
    expect(frozen.immutableFiles.map(({ role }) => role)).toEqual(expect.arrayContaining([
      "v1_baseline_freeze",
      "v1_1_spec",
      "fixtures",
      "thresholds",
      "runner",
      "isolated_database_schema",
      "validator",
      "freeze_verifier",
    ]));
    await expect(verifyVoiceVerifierV1AdversarialFreeze()).resolves.toBeDefined();
  });
});

describe("Voice Verifier V1.1 explicit check action", () => {
  for (const fixture of corpus.checkCases) {
    it(fixture.id, () => {
      const result = verifyText(fixture.rawTranscript, fixture.language, fixture.locale);
      expectCommon(result, fixture.expected);
      expect(formatVoiceVerifierBlock(result)?.includes(fixture.rawTranscript)).not.toBe(true);
    });
  }
});

describe("Voice Verifier V1.1 explicit cancel action", () => {
  for (const fixture of corpus.cancelCases) {
    it(fixture.id, async () => {
      const result = verifyText(fixture.rawTranscript);
      expectCommon(result, fixture.expected);
      const production = await bindingModule();
      const proposal = fixture.proposalState === "missing" ? null : {
        ...baseProposal(),
        status: fixture.proposalState,
      } as ProposalRecord;
      const request = baseRequest(1);
      if (fixture.identity === "wrong_owner") request.ownerHash = "c".repeat(64);
      if (fixture.identity === "wrong_conversation") request.conversationHash = "d".repeat(64);
      const binding = production.evaluateVoiceProposalBinding(proposal, request);
      expect(binding.reason).toBe(fixture.expectedBindingReason);
      expect(binding.externalActionAllowed).toBe(false);
    });
  }
});

describe("Voice Verifier V1.1 weekday resolution", () => {
  for (const fixture of corpus.weekdayCases) {
    it(fixture.id, () => {
      const result = verifyText(fixture.rawTranscript, fixture.language, fixture.locale, {
        temporalContext: fixture.temporalContext,
      });
      expectBlocked(result);
      expect(result.actions.map(({ action }) => action)).toContain(fixture.expected.action);
      expect(result.tier).toBe(fixture.expected.tier);
      const weekday = result.entities.find(({ raw }) => raw.toLowerCase() === fixture.expected.weekdayRaw.toLowerCase());
      expect(weekday, `${fixture.id}: weekday entity missing`).toBeDefined();
      expect(weekday?.canonicalValue).toBe(fixture.expected.weekdayCanonical);
      expect(weekday?.resolution).toBe(fixture.expected.weekdayResolution);
      if (fixture.expected.dateRaw) {
        const date = result.entities.find(({ raw }) => raw === fixture.expected.dateRaw);
        expect(date?.canonicalValue).toBe(fixture.expected.dateCanonical);
        expect(date?.resolution).toBe("exact");
      }
      if (fixture.expected.timeRaw) {
        const time = result.entities.find(({ raw }) => raw === fixture.expected.timeRaw);
        expect(time?.resolution).toBe(fixture.expected.timeResolution);
      }
      if (fixture.expected.reason) expect(result.reasons).toContain(fixture.expected.reason);
      expect(result.externalActionAllowed).toBe(false);
    });
  }
});

describe("Voice Verifier V1.1 semantic lifecycle failures", () => {
  for (const fixture of corpus.semanticTimeoutCases) {
    it(fixture.id, () => {
      const baseline = verifyText(fixture.rawTranscript);
      const result = verifyText(fixture.rawTranscript, "english", "en-AU", {
        semanticLifecycle: fixture.lifecycle,
      });
      expect(baseline.tier).toBe(fixture.expected.baselineTier);
      expect(result.tier).toBeGreaterThanOrEqual(baseline.tier);
      expect(result.semanticStatus as string).toBe(fixture.expected.status);
      expect(result.reasons).toContain(fixture.expected.reason);
      expectBlocked(result);
      expect(result.authority).toBe(baseline.authority);
    });
  }
});

describe("Voice Verifier V1.1 atomic proposal binding", () => {
  it("binds the synthetic token to every required identity field", async () => {
    const production = await bindingModule();
    expect(production.createVoiceProposalTokenHashes(baseProposal(), corpus.bindingBase.rawToken)).toEqual({
      tokenHash: corpus.bindingBase.tokenHash,
      tokenBindingHash: corpus.bindingBase.tokenBindingHash,
    });
  });

  for (const fixture of corpus.bindingCases) {
    it(fixture.id, async () => {
      const production = await bindingModule();
      const { proposal, request } = mutatedBinding(fixture);
      const result = production.evaluateVoiceProposalBinding(proposal, request);
      expect(result.bindingValid).toBe(fixture.expected.bindingValid);
      expect(result.confirmationUsable).toBe(fixture.expected.confirmationUsable);
      expect(result.reason).toBe(fixture.expected.reason);
      expect(result.externalActionAllowed).toBe(false);
      if (fixture.mutation !== "none") expect(result.confirmationUsable).toBe(false);
    });
  }
});

describe("Voice Verifier V1.1 isolated composite persistence", () => {
  for (const fixture of corpus.persistenceCases) {
    it(fixture.id, () => {
      const db = openDatabase();
      try {
        insertProposal(db);
        const operation = () => {
          switch (fixture.operation) {
            case "insert_matching_attempt":
              insertAttempt(db, fixture.id, fixture.accepted);
              return;
            case "insert_wrong_owner":
              insertAttempt(db, fixture.id, fixture.accepted, { owner_hash: "c".repeat(64) });
              return;
            case "insert_wrong_conversation":
              insertAttempt(db, fixture.id, fixture.accepted, { conversation_hash: "d".repeat(64) });
              return;
            case "insert_wrong_owner_conversation":
              insertAttempt(db, fixture.id, fixture.accepted, {
                owner_hash: "c".repeat(64),
                conversation_hash: "d".repeat(64),
              });
              return;
            case "copy_proposal_owner":
              insertProposal(db, { proposal_id: "proposal-v11-copy-owner", owner_hash: "c".repeat(64) });
              return;
            case "copy_proposal_conversation":
              insertProposal(db, { proposal_id: "proposal-v11-copy-conversation", conversation_hash: "d".repeat(64) });
              return;
            case "duplicate_token_cross_tenant":
              insertProposal(db, {
                proposal_id: "proposal-v11-other-tenant",
                owner_hash: "c".repeat(64),
                conversation_hash: "d".repeat(64),
                token_binding_hash: "e".repeat(64),
              });
              return;
            case "mutate_each_binding_field": {
              const mutations = [
                { proposal_id: "proposal-v11-beta" },
                { owner_hash: "c".repeat(64) },
                { conversation_hash: "d".repeat(64) },
                { policy_version: "NITSYCLAW-VOICE-VERIFIER-V0" },
                { token_hash: "e".repeat(64) },
                { token_binding_hash: "f".repeat(64) },
              ];
              for (const [index, mutation] of mutations.entries()) {
                expect(() => insertAttempt(db, `${fixture.id}-${index}`, fixture.accepted, mutation)).toThrow();
              }
              return;
            }
            default:
              throw new Error(`unknown persistence operation: ${fixture.operation}`);
          }
        };
        if (fixture.expectedRejected) expect(operation).toThrow();
        else expect(operation).not.toThrow();
      } finally {
        db.close();
      }
    });
  }

  it("rolls back the disposable composite store without residue", () => {
    const db = openDatabase();
    try {
      db.exec("BEGIN");
      insertProposal(db);
      insertAttempt(db, "rollback-attempt", 0);
      db.exec("ROLLBACK");
      expect((db.prepare("SELECT count(*) AS count FROM voice_v11_proposals").get() as { count: number }).count).toBe(0);
      expect((db.prepare("SELECT count(*) AS count FROM voice_v11_confirmation_attempts").get() as { count: number }).count).toBe(0);
    } finally {
      db.close();
    }
  });
});

describe("Voice Verifier V1.1 production persistence contract", () => {
  it("enforces the full identity in schema, migration, and every repository path", async () => {
    await expect(bindingModule()).resolves.toBeDefined();
    expect(existsSync(migrationPath)).toBe(true);
    const schema = readFileSync(join(repositoryRoot, "packages", "shared", "src", "db", "schema.ts"), "utf8");
    const migration = readFileSync(migrationPath, "utf8");
    const repo = readFileSync(join(repositoryRoot, "packages", "shared", "src", "db", "repo.ts"), "utf8");
    expect(schema).toContain("voiceVerificationProposals");
    expect(schema).toContain("voiceVerificationConfirmations");
    for (const column of ["proposal_id", "owner_hash", "conversation_hash", "policy_version", "token_hash", "token_binding_hash"]) {
      expect(migration).toContain(column);
    }
    expect(migration).toMatch(/FOREIGN KEY[\s\S]+proposal_id[\s\S]+owner_hash[\s\S]+conversation_hash[\s\S]+policy_version[\s\S]+token_hash[\s\S]+token_binding_hash/iu);
    expect(migration).toMatch(/UNIQUE\s*\(\s*"?token_hash"?\s*\)/iu);
    for (const name of corpus.requiredRepositoryPaths) {
      const source = functionSource(repo, name);
      expect(source, `${name}: repository path missing`).not.toBe("");
      for (const field of ["proposalId", "ownerHash", "conversationHash", "policyVersion"]) {
        expect(source, `${name}: ${field} missing`).toContain(field);
      }
      if (name === "recordVoiceVerificationConfirmation" || name === "insertVoiceVerificationProposal") {
        expect(source).toContain("tokenHash");
        expect(source).toContain("tokenBindingHash");
      }
    }
  });
});

describe("Voice Verifier V1.1 deterministic safety properties", () => {
  it("meets the frozen p95 and zero-authority limits", () => {
    const durations: number[] = [];
    let externalActionAllowedCount = 0;
    for (let repeat = 0; repeat < 100; repeat++) {
      for (const fixture of [...corpus.checkCases, ...corpus.cancelCases]) {
        const started = performance.now();
        const result = verifyText(fixture.rawTranscript);
        durations.push(performance.now() - started);
        if (result.externalActionAllowed) externalActionAllowedCount++;
      }
    }
    durations.sort((left, right) => left - right);
    const p95 = durations[Math.ceil(durations.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
    expect(p95).toBeLessThanOrEqual(thresholds.deterministicP95MsMax);
    expect(externalActionAllowedCount).toBeLessThanOrEqual(thresholds.externalActionAllowedCountMax);
  });

  it("is deterministic across repeated V1.1 text inputs", () => {
    for (const fixture of [...corpus.checkCases, ...corpus.cancelCases, ...corpus.weekdayCases]) {
      const extensions = "temporalContext" in fixture && fixture.temporalContext
        ? { temporalContext: fixture.temporalContext }
        : {};
      const first = verifyText(fixture.rawTranscript, "english", "en-AU", extensions);
      for (let repeat = 0; repeat < 20; repeat++) {
        expect(verifyText(fixture.rawTranscript, "english", "en-AU", extensions)).toEqual(first);
      }
    }
  });

  it("contains no network or external-effect primitive in the V1.1 path", () => {
    expect(existsSync(bindingModulePath)).toBe(true);
    const sources = [
      "packages/shared/src/voice/canonicalize.ts",
      "packages/shared/src/voice/risk-policy.ts",
      "packages/shared/src/voice/verifier.ts",
      "packages/shared/src/voice/proposal-binding.ts",
    ].map((path) => readFileSync(join(repositoryRoot, ...path.split("/")), "utf8")).join("\n");
    expect(sources).not.toMatch(/\bfetch\s*\(|node:https?|WebSocket|sendMessage|tool\.handler|insertMemory/iu);
  });
});
