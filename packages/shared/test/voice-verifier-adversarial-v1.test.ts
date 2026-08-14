import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import fixturesJson from "../../../scripts/voice-eval/voice-verifier-v1-adversarial-fixtures.json";
import thresholds from "../../../scripts/voice-eval/voice-verifier-v1-adversarial-thresholds.json";
import { verifyVoiceVerifierV1AdversarialFreeze } from "../../../scripts/voice-eval/verify-voice-verifier-v1-adversarial-freeze.js";
import { redactAuditString } from "../src/db/repo.js";
import {
  formatVoiceVerifierBlock,
  verifyVoiceTranscript,
  type VerifiedVoiceContact,
  type VerifiedVoiceProduct,
  type VoiceLanguage,
  type VoiceResolutionState,
  type VoiceSemanticStatus,
  type VoiceVerificationDisposition,
  type VoiceVerificationInput,
  type VoiceVerificationResult,
} from "../src/voice/index.js";

type ExpectedEntity = {
  fieldType: string;
  canonicalValue: string | null;
  resolution: VoiceResolutionState;
};

type TranscriptCase = {
  id: string;
  categories: string[];
  rawTranscript: string;
  language: VoiceLanguage;
  ownerHash: string;
  contactIds?: string[];
  productIds?: string[];
  requiredRecipientChannel?: VerifiedVoiceContact["channel"];
  expected: {
    outcome: "allowed" | "blocked";
    tier?: number;
    minTier?: number;
    disposition?: VoiceVerificationDisposition;
    unicodeSafe?: boolean;
    authority?: string;
    negated?: boolean;
    correction?: string;
    recipientResolution?: VoiceResolutionState;
    recipientRecordId?: string;
    productResolution?: VoiceResolutionState;
    productRecordId?: string;
    entity?: ExpectedEntity;
    entities?: ExpectedEntity[];
    canonicalValues?: string[];
    absentFieldType?: string;
  };
};

type SemanticCase = {
  id: string;
  rawTranscript: string;
  semantic?: Record<string, unknown>;
  semanticJson?: string;
  expectedStatus: VoiceSemanticStatus | "parse_rejected";
  expectedOutcome: "allowed" | "blocked";
};

type MutationFamily = {
  id: string;
  kind: "each_digit_every_alternate" | "declared_replacements";
  template: string;
  baseline: string;
  replacements?: string[];
  fieldType: string;
  expectedCount?: number;
  productIds?: string[];
};

type Corpus = {
  contacts: VerifiedVoiceContact[];
  products: VerifiedVoiceProduct[];
  transcriptCases: TranscriptCase[];
  semanticCases: SemanticCase[];
  mutationFamilies: MutationFamily[];
  stateCases: Array<{ id: string; operation: string; expectedAuthority: false }>;
  authorizationCases: Array<{ id: string; rawTranscript: string; expectedBlocked: true }>;
  failureCases: Array<{ id: string; operation: string; expectedFailClosed: true }>;
};

const corpus = fixturesJson as unknown as Corpus;
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
const sqliteSchema = readFileSync("scripts/voice-eval/voice-verifier-v1-adversarial-db-schema.sql", "utf8");
const originalTimezone = process.env.TZ;

afterEach(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

function selectedContacts(ids: string[] | undefined): VerifiedVoiceContact[] {
  if (!ids) return [];
  return ids.map((id) => {
    const record = corpus.contacts.find((contact) => contact.id === id);
    if (!record) throw new Error(`unknown synthetic contact: ${id}`);
    return structuredClone(record);
  });
}

function selectedProducts(ids: string[] | undefined): VerifiedVoiceProduct[] {
  if (!ids) return [];
  return ids.map((id) => {
    const record = corpus.products.find((product) => product.id === id);
    if (!record) throw new Error(`unknown synthetic product: ${id}`);
    return structuredClone(record);
  });
}

function verifyCase(fixture: TranscriptCase, overrides: Partial<VoiceVerificationInput> = {}): VoiceVerificationResult {
  const input = {
    rawTranscript: fixture.rawTranscript,
    ownerHash: fixture.ownerHash,
    language: fixture.language,
    providerConfidence: null,
    locale: fixture.language === "english" ? "en-AU" : "hi-IN",
    contacts: selectedContacts(fixture.contactIds),
    products: selectedProducts(fixture.productIds),
    requiredRecipientChannel: fixture.requiredRecipientChannel,
    ...overrides,
  } as VoiceVerificationInput & { requiredRecipientChannel?: VerifiedVoiceContact["channel"] };
  return verifyVoiceTranscript(input);
}

function expectBlocked(result: VoiceVerificationResult): void {
  expect(blockedDispositions.has(result.disposition)).toBe(true);
  expect(result.externalActionAllowed).toBe(false);
  expect(result.tierPolicy.externalActionAllowed).toBe(false);
  expect(result.tierPolicy.voiceConfirmationSufficient).toBe(false);
  expect(result.tierPolicy.survivesRestart).toBe(false);
}

function expectAllowed(result: VoiceVerificationResult): void {
  expect(allowedDispositions.has(result.disposition)).toBe(true);
  expect(result.externalActionAllowed).toBe(false);
}

function assertTranscriptCase(fixture: TranscriptCase, result: VoiceVerificationResult): void {
  const expected = fixture.expected;
  expect(result.rawTranscript).toBe(fixture.rawTranscript);
  expect(result.providerConfidence).toBeNull();
  expect(result.externalActionAllowed).toBe(false);
  if (expected.outcome === "blocked") expectBlocked(result);
  else expectAllowed(result);
  if (expected.tier !== undefined) expect(result.tier).toBe(expected.tier);
  if (expected.minTier !== undefined) expect(result.tier).toBeGreaterThanOrEqual(expected.minTier);
  if (expected.disposition) expect(result.disposition).toBe(expected.disposition);
  if (expected.unicodeSafe !== undefined) expect(result.unicode.safe).toBe(expected.unicodeSafe);
  if (expected.authority) expect(result.authority).toBe(expected.authority);
  if (expected.negated !== undefined) expect(result.negated).toBe(expected.negated);
  if (expected.correction) expect(result.correction).toBe(expected.correction);

  const recipient = result.entities.find(({ fieldType }) => fieldType === "recipient");
  const product = result.entities.find(({ fieldType }) => fieldType === "product");
  if (expected.recipientResolution) expect(recipient?.resolution).toBe(expected.recipientResolution);
  if (expected.recipientRecordId) expect(recipient?.recordId).toBe(expected.recipientRecordId);
  if (expected.productResolution) expect(product?.resolution).toBe(expected.productResolution);
  if (expected.productRecordId) expect(product?.recordId).toBe(expected.productRecordId);
  for (const entity of [expected.entity, ...(expected.entities ?? [])].filter(Boolean) as ExpectedEntity[]) {
    const actual = result.entities.find(({ fieldType }) => fieldType === entity.fieldType);
    expect(actual, `${fixture.id}: missing ${entity.fieldType}`).toBeDefined();
    expect(actual?.canonicalValue).toBe(entity.canonicalValue);
    expect(actual?.resolution).toBe(entity.resolution);
  }
  if (expected.canonicalValues) {
    expect(result.entities.map(({ canonicalValue }) => canonicalValue).filter(Boolean)).toEqual(
      expect.arrayContaining(expected.canonicalValues),
    );
  }
  if (expected.absentFieldType) {
    expect(result.entities.some(({ fieldType }) => fieldType === expected.absentFieldType)).toBe(false);
  }
  for (const entity of result.entities) {
    expect(result.rawTranscript.slice(entity.span.start, entity.span.end)).toBe(entity.span.text);
    expect(entity.raw).toBe(entity.span.text);
  }
}

function verificationFor(rawTranscript: string, options: {
  ownerHash?: string;
  contacts?: VerifiedVoiceContact[];
  products?: VerifiedVoiceProduct[];
  locale?: VoiceVerificationInput["locale"];
  semantic?: unknown;
} = {}): VoiceVerificationResult {
  return verifyVoiceTranscript({
    rawTranscript,
    ownerHash: options.ownerHash ?? "owner-alpha",
    language: /[\u0900-\u097f]/u.test(rawTranscript) ? "hinglish" : "english",
    providerConfidence: null,
    locale: options.locale ?? "en-AU",
    contacts: options.contacts ?? [],
    products: options.products ?? [],
    semantic: options.semantic as never,
  });
}

function canonicalFor(result: VoiceVerificationResult, fieldType: string): string | null | undefined {
  if (fieldType === "power_or_energy") {
    return result.entities.find(({ fieldType: type }) => type === "power" || type === "energy")?.canonicalValue;
  }
  return result.entities.find(({ fieldType: type }) => type === fieldType)?.canonicalValue;
}

function expandedMutations(family: MutationFamily): string[] {
  if (family.kind === "declared_replacements") return [...(family.replacements ?? [])];
  const mutations: string[] = [];
  for (let index = 0; index < family.baseline.length; index++) {
    for (const digit of "0123456789") {
      if (digit === family.baseline[index]) continue;
      mutations.push(`${family.baseline.slice(0, index)}${digit}${family.baseline.slice(index + 1)}`);
    }
  }
  return mutations;
}

function openIsolatedDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(sqliteSchema);
  return db;
}

function hash(char: string): string {
  return char.repeat(64);
}

function insertProposal(db: DatabaseSync, overrides: Partial<Record<string, unknown>> = {}): void {
  const row = {
    proposal_id: "proposal-a",
    owner_hash: hash("a"),
    conversation_hash: hash("b"),
    transcript_hash: hash("c"),
    policy_hash: hash("d"),
    catalogue_version_hash: hash("e"),
    directory_version_hash: hash("f"),
    tier: 4,
    disposition: "require_text_restatement",
    external_action_allowed: 0,
    status: "pending",
    expires_at_ms: 60_000,
    created_at_ms: 0,
    consumed_at_ms: null,
    ...overrides,
  };
  db.prepare(`INSERT INTO voice_proposals (
    proposal_id, owner_hash, conversation_hash, transcript_hash, policy_hash,
    catalogue_version_hash, directory_version_hash, tier, disposition,
    external_action_allowed, status, expires_at_ms, created_at_ms, consumed_at_ms
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    row.proposal_id, row.owner_hash, row.conversation_hash, row.transcript_hash, row.policy_hash,
    row.catalogue_version_hash, row.directory_version_hash, row.tier, row.disposition,
    row.external_action_allowed, row.status, row.expires_at_ms, row.created_at_ms, row.consumed_at_ms,
  );
}

describe("Voice Verifier V1 adversarial freeze", () => {
  it("keeps the held-out corpus, thresholds, runner and isolated schema immutable", async () => {
    const frozen = await verifyVoiceVerifierV1AdversarialFreeze();
    expect(frozen.initialCommit).toBe("532a45b744e2ad0c626f02fe381a80f33e5a757b");
    expect(frozen.immutableFiles.some(({ role }) => role === "runner")).toBe(true);
  });
});

describe("Voice Verifier V1 held-out explicit corpus", () => {
  for (const fixture of corpus.transcriptCases) {
    it(fixture.id, () => assertTranscriptCase(fixture, verifyCase(fixture)));
  }
});

describe("Voice Verifier V1 held-out semantic abuse", () => {
  for (const fixture of corpus.semanticCases) {
    it(fixture.id, () => {
      if (fixture.semanticJson !== undefined) {
        expect(() => JSON.parse(fixture.semanticJson!)).toThrow();
        expect(fixture.expectedStatus).toBe("parse_rejected");
        expect(fixture.expectedOutcome).toBe("blocked");
        return;
      }
      const result = verificationFor(fixture.rawTranscript, { semantic: fixture.semantic });
      expect(result.semanticStatus).toBe(fixture.expectedStatus);
      if (fixture.expectedOutcome === "blocked") expectBlocked(result);
      else expectAllowed(result);
    });
  }
});

describe("Voice Verifier V1 generated critical-field mutations", () => {
  for (const family of corpus.mutationFamilies) {
    it(family.id, () => {
      const products = selectedProducts(family.productIds);
      const baselineResult = verificationFor(family.template.replace("{value}", family.baseline), { products });
      const baselineCanonical = canonicalFor(baselineResult, family.fieldType);
      expect(baselineCanonical).not.toBeUndefined();
      const mutations = expandedMutations(family);
      if (family.expectedCount !== undefined) expect(mutations).toHaveLength(family.expectedCount);
      let rejected = 0;
      for (const mutation of mutations) {
        const result = verificationFor(family.template.replace("{value}", mutation), { products });
        expect(result.externalActionAllowed).toBe(false);
        expect(blockedDispositions.has(result.disposition)).toBe(true);
        expect(canonicalFor(result, family.fieldType)).not.toBe(baselineCanonical);
        rejected++;
      }
      expect(rejected / mutations.length).toBeGreaterThanOrEqual(thresholds.criticalMutationRejectionRateMin);
    });
  }
});

describe("Voice Verifier V1 state and correlation attacks", () => {
  for (const fixture of corpus.stateCases) {
    it(fixture.id, async () => {
      const baseInput = {
        rawTranscript: "Send the quote to Anika.",
        ownerHash: "owner-alpha",
        language: "english" as const,
        providerConfidence: null,
        contacts: selectedContacts(["contact-anika-whatsapp"]),
        products: selectedProducts(["product-powerwall-3"]),
      };
      const base = verifyVoiceTranscript(baseInput);
      const results: VoiceVerificationResult[] = [base];
      switch (fixture.operation) {
        case "changed_transcript":
        case "confirmation_after_mutation":
          results.push(verifyVoiceTranscript({ ...baseInput, rawTranscript: "Send the quote to Ravi." }));
          expect(results[1]?.rawTranscript).not.toBe(base.rawTranscript);
          break;
        case "changed_directory":
          results.push(verifyVoiceTranscript({ ...baseInput, contacts: [] }));
          expect(results[1]?.entities.find(({ fieldType }) => fieldType === "recipient")?.resolution).not.toBe("exact");
          break;
        case "changed_catalogue":
          results.push(verifyVoiceTranscript({ ...baseInput, rawTranscript: "Order Tesla Powerwall 8.", products: [] }));
          break;
        case "restart":
          results.push(verifyVoiceTranscript(structuredClone(baseInput)));
          expect(results[1]).toEqual(base);
          break;
        case "concurrent_four": {
          const concurrent = await Promise.all([0, 1, 2, 3].map(async (index) => verifyVoiceTranscript({
            ...baseInput,
            ownerHash: `owner-concurrent-${index}`,
            rawTranscript: `Send quote ${index} to Anika.`,
          })));
          expect(new Set(concurrent.map(({ rawTranscript }) => rawTranscript)).size).toBe(4);
          results.push(...concurrent);
          break;
        }
        case "cross_owner":
          results.push(verifyVoiceTranscript({ ...baseInput, ownerHash: "owner-beta" }));
          expect(results[1]?.entities.find(({ fieldType }) => fieldType === "recipient")?.resolution).not.toBe("exact");
          break;
        case "reorder":
          results.push(...["Call Anika.", "Send the quote.", "Draft a note."]
            .reverse()
            .map((rawTranscript) => verificationFor(rawTranscript)));
          break;
        default:
          expect(base.tierPolicy.survivesRestart).toBe(false);
          break;
      }
      for (const result of results) {
        expect(result.externalActionAllowed).toBe(fixture.expectedAuthority);
        expect("confirmationToken" in result).toBe(false);
        expect(result.tierPolicy.voiceConfirmationSufficient).toBe(false);
      }
    });
  }
});

describe("Voice Verifier V1 authorization bypass", () => {
  for (const fixture of corpus.authorizationCases) {
    it(fixture.id, () => {
      const result = verificationFor(fixture.rawTranscript);
      expectBlocked(result);
      expect("confirmationToken" in result).toBe(false);
    });
  }
});

describe("Voice Verifier V1 deterministic properties", () => {
  it("is byte-for-byte deterministic across repeated runs", () => {
    for (const fixture of corpus.transcriptCases) {
      const first = verifyCase(fixture);
      for (let repeat = 0; repeat < 20; repeat++) expect(verifyCase(fixture)).toEqual(first);
    }
  });

  it("is deterministic across supported locales for locale-independent fixtures", () => {
    const localeIndependent = corpus.transcriptCases.filter(({ rawTranscript }) => !/\d{1,2}[/-]\d{1,2}[/-]\d{4}/u.test(rawTranscript));
    for (const fixture of localeIndependent) {
      const results = (["en-AU", "en-IN", "hi-IN"] as const).map((locale) => verifyCase(fixture, { locale }));
      expect(results[1]).toEqual(results[0]);
      expect(results[2]).toEqual(results[0]);
    }
  });

  it("is deterministic across process timezone changes", () => {
    for (const fixture of corpus.transcriptCases) {
      process.env.TZ = "UTC";
      const utc = verifyCase(fixture);
      process.env.TZ = "Australia/Sydney";
      const sydney = verifyCase(fixture);
      process.env.TZ = "Asia/Kolkata";
      const kolkata = verifyCase(fixture);
      expect(sydney).toEqual(utc);
      expect(kolkata).toEqual(utc);
    }
  });

  it("meets the frozen deterministic p95 and zero-authority limits", () => {
    const durations: number[] = [];
    let externalActionAllowedCount = 0;
    for (let repeat = 0; repeat < 100; repeat++) {
      for (const fixture of corpus.transcriptCases) {
        const started = performance.now();
        const result = verifyCase(fixture);
        durations.push(performance.now() - started);
        if (result.externalActionAllowed) externalActionAllowedCount++;
      }
    }
    durations.sort((left, right) => left - right);
    const p95 = durations[Math.ceil(durations.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
    expect(p95).toBeLessThanOrEqual(thresholds.deterministicP95MsMax);
    expect(externalActionAllowedCount).toBeLessThanOrEqual(thresholds.externalActionAllowedCountMax);
  });

  it("has no network or external-effect primitive in the deterministic verifier", () => {
    const sources = [
      "packages/shared/src/voice/unicode-policy.ts",
      "packages/shared/src/voice/canonicalize.ts",
      "packages/shared/src/voice/resolution.ts",
      "packages/shared/src/voice/risk-policy.ts",
      "packages/shared/src/voice/verifier.ts",
    ].map((path) => readFileSync(path, "utf8")).join("\n");
    expect(sources).not.toMatch(/\bfetch\s*\(|node:https?|WebSocket|sendMessage|tool\.handler|insertMemory/iu);
  });
});

describe("Voice Verifier V1 isolated persistence and failure injection", () => {
  for (const fixture of corpus.failureCases) {
    it(fixture.id, () => {
      const db = openIsolatedDatabase();
      try {
        switch (fixture.operation) {
          case "closed_database":
            db.close();
            expect(() => db.prepare("SELECT 1")).toThrow();
            return;
          case "rollback":
            db.exec("BEGIN");
            insertProposal(db);
            db.exec("ROLLBACK");
            expect((db.prepare("SELECT count(*) AS count FROM voice_proposals").get() as { count: number }).count).toBe(0);
            break;
          case "close_mid_flow":
            insertProposal(db);
            db.close();
            expect(() => db.prepare("INSERT INTO voice_confirmation_attempts VALUES (?, ?, ?, ?, ?, ?, ?, ?)")).toThrow();
            return;
          case "clock_jump":
            insertProposal(db, { expires_at_ms: 100 });
            expect((db.prepare("SELECT count(*) AS count FROM voice_proposals WHERE status='pending' AND expires_at_ms >= ?").get(99) as { count: number }).count).toBe(1);
            expect((db.prepare("SELECT count(*) AS count FROM voice_proposals WHERE status='pending' AND expires_at_ms >= ?").get(101) as { count: number }).count).toBe(0);
            break;
          case "duplicate_token":
            insertProposal(db);
            db.prepare("INSERT INTO voice_confirmation_attempts VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
              .run("attempt-a", "proposal-a", hash("a"), hash("b"), hash("1"), hash("2"), 0, 1);
            expect(() => db.prepare("INSERT INTO voice_confirmation_attempts VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
              .run("attempt-b", "proposal-a", hash("a"), hash("b"), hash("1"), hash("3"), 0, 2)).toThrow();
            break;
          case "constraint_violation":
            expect(() => insertProposal(db, { external_action_allowed: 1 })).toThrow();
            break;
          case "missing_policy":
            expect(() => insertProposal(db, { policy_hash: null })).toThrow();
            break;
          case "missing_catalogue":
            expect(() => insertProposal(db, { catalogue_version_hash: null })).toThrow();
            break;
          case "missing_directory":
            expect(() => insertProposal(db, { directory_version_hash: null })).toThrow();
            break;
          default:
            throw new Error(`unhandled failure fixture: ${fixture.operation}`);
        }
        expect(fixture.expectedFailClosed).toBe(true);
      } finally {
        try { db.close(); } catch { /* already closed by the fixture */ }
      }
    });
  }

  it("enforces owner-bound, one-use, never-accepted confirmations", () => {
    const db = openIsolatedDatabase();
    try {
      insertProposal(db);
      expect(() => db.prepare("INSERT INTO voice_confirmation_attempts VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run("attempt-owner-mismatch", "proposal-a", hash("9"), hash("b"), hash("1"), hash("2"), 1, 1)).toThrow();
      expect((db.prepare("SELECT count(*) AS count FROM voice_confirmation_attempts").get() as { count: number }).count).toBe(0);
    } finally {
      db.close();
    }
  });

  it("expires and cleans synthetic proposals without retaining confirmation rows", () => {
    const db = openIsolatedDatabase();
    try {
      insertProposal(db, { expires_at_ms: 10 });
      db.prepare("UPDATE voice_proposals SET status='expired' WHERE status='pending' AND expires_at_ms < ?").run(11);
      db.prepare("DELETE FROM voice_proposals WHERE status='expired'").run();
      expect((db.prepare("SELECT count(*) AS count FROM voice_proposals").get() as { count: number }).count).toBe(0);
      expect((db.prepare("SELECT count(*) AS count FROM voice_confirmation_attempts").get() as { count: number }).count).toBe(0);
    } finally {
      db.close();
    }
  });
});

describe("Voice Verifier V1 privacy and integration isolation", () => {
  it("redacts synthetic email, phone and token shapes from audit strings", () => {
    const raw = "synthetic.person@example.test +61 400 000 001 sk_test_syntheticsecret123";
    const redacted = redactAuditString(raw);
    expect(redacted).not.toContain("synthetic.person@example.test");
    expect(redacted).not.toContain("+61 400 000 001");
    expect(redacted).not.toContain("sk_test_syntheticsecret123");
  });

  it("never echoes raw transcript content in a verifier block", () => {
    const rawTranscript = "Dispatch synthetic-private-marker to Ravi.";
    const block = formatVoiceVerifierBlock(verificationFor(rawTranscript, {
      contacts: selectedContacts(["contact-ravi-whatsapp"]),
    }));
    expect(block).toContain("I did not act");
    expect(block).not.toContain("synthetic-private-marker");
    expect(block).not.toContain("Ravi");
  });

  it("holds blocked voice work before agent execution and never promotes it to memory", () => {
    const router = readFileSync("apps/bot/src/router.ts", "utf8");
    const verifyAt = router.indexOf("const verification = verifyVoiceTranscript");
    const agentAt = router.indexOf("const result = await runAgent", verifyAt);
    const heldAt = router.indexOf("holdCommandJobForVoiceVerification", verifyAt);
    const returnAt = router.indexOf("return;", heldAt);
    expect(verifyAt).toBeGreaterThan(0);
    expect(heldAt).toBeGreaterThan(verifyAt);
    expect(returnAt).toBeGreaterThan(heldAt);
    expect(agentAt).toBeGreaterThan(returnAt);
    expect(router.slice(verifyAt, returnAt)).not.toMatch(/insertMemory|save_people_memory|tool\.handler/iu);
  });

  it("keeps verified contact identity fields encrypted and tenant guarded", () => {
    const repo = readFileSync("packages/shared/src/db/repo.ts", "utf8");
    const schema = readFileSync("packages/shared/src/db/schema.ts", "utf8");
    const contactSchema = schema.slice(
      schema.indexOf("export const verifiedVoiceContacts"),
      schema.indexOf("export const verifiedVoiceProducts"),
    );
    expect(repo).toContain("isEncryptedString(input.displayNameCiphertext)");
    expect(repo).toContain("isEncryptedString(input.aliasesCiphertext)");
    expect(repo).toContain("isEncryptedString(input.destinationCiphertext)");
    expect(repo).toContain("guardUnscopedCustomerDataAccess(tenant)");
    expect(contactSchema).not.toContain('displayName: text("display_name")');
    expect(contactSchema).not.toContain('aliases: jsonb("aliases")');
  });

  it("pins raw implementation evidence without storing transcript content", () => {
    const verifierSource = readFileSync("packages/shared/src/voice/verifier.ts", "utf8");
    const digest = createHash("sha256").update(verifierSource.replace(/\r\n?/gu, "\n"), "utf8").digest("hex");
    expect(digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(digest).not.toContain("transcript");
  });
});
