import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import fixtures from "./voice-verifier-v1-adversarial-fixtures.json";
import thresholds from "./voice-verifier-v1-adversarial-thresholds.json";

const directory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(directory, "..", "..");
const requiredCategories = new Set([
  "actions",
  "multilingual",
  "negation",
  "correction",
  "authority",
  "prompt-injection",
  "contacts",
  "collisions",
  "tenant",
  "products",
  "numbers",
  "dates",
  "unicode",
  "authorization",
  "state",
]);
const allowedDispositions = new Set(["allow_transcript", "allow_conversation", "allow_local_preview"]);
const blockedDispositions = new Set([
  "require_text_clarification",
  "require_text_confirmation",
  "require_text_restatement",
  "reject",
]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n?/gu, "\n"), "utf8").digest("hex");
}

function allIds(): string[] {
  return [
    ...fixtures.transcriptCases.map(({ id }) => id),
    ...fixtures.semanticCases.map(({ id }) => id),
    ...fixtures.mutationFamilies.map(({ id }) => id),
    ...fixtures.stateCases.map(({ id }) => id),
    ...fixtures.authorizationCases.map(({ id }) => id),
    ...fixtures.failureCases.map(({ id }) => id),
  ];
}

export async function validateVoiceVerifierV1AdversarialFreezeInputs(): Promise<Record<string, unknown>> {
  assert(fixtures.schemaVersion === "NITSYCLAW-VOICE-VERIFIER-V1-ADVERSARIAL-FIXTURES", "fixture schema invalid");
  assert(fixtures.syntheticOnly === true, "fixtures must be synthetic only");
  assert(thresholds.schemaVersion === "NITSYCLAW-VOICE-VERIFIER-V1-ADVERSARIAL-THRESHOLDS", "threshold schema invalid");
  for (const [key, value] of Object.entries(thresholds)) {
    if (key === "schemaVersion" || key === "deterministicP95MsMax") continue;
    assert(value === 0 || value === 1, `threshold ${key} must remain zero or one`);
  }
  assert(thresholds.deterministicP95MsMax === 250, "p95 threshold must remain 250 ms");

  const ids = allIds();
  assert(ids.length === new Set(ids).size, "fixture IDs must be globally unique");
  assert(ids.every((id) => /^[a-z0-9][a-z0-9-]+$/u.test(id)), "fixture IDs must be stable kebab-case");

  const categories = new Map<string, number>();
  let safeCount = 0;
  let unsafeCount = 0;
  for (const fixture of fixtures.transcriptCases) {
    assert(fixture.rawTranscript.trim().length > 0, `${fixture.id}: transcript empty`);
    assert(fixture.rawTranscript.length <= 240, `${fixture.id}: transcript too long`);
    assert(fixture.expected.outcome === "allowed" || fixture.expected.outcome === "blocked", `${fixture.id}: outcome invalid`);
    if (fixture.expected.outcome === "allowed") {
      safeCount++;
      assert(fixture.expected.disposition && allowedDispositions.has(fixture.expected.disposition), `${fixture.id}: safe disposition invalid`);
      assert(fixture.expected.tier !== undefined && fixture.expected.tier <= 2, `${fixture.id}: safe tier invalid`);
    } else {
      unsafeCount++;
      if (fixture.expected.disposition) {
        assert(blockedDispositions.has(fixture.expected.disposition), `${fixture.id}: blocked disposition invalid`);
      }
    }
    for (const category of fixture.categories) categories.set(category, (categories.get(category) ?? 0) + 1);
  }
  for (const category of requiredCategories) {
    const auxiliaryCount = category === "state"
      ? fixtures.stateCases.length
      : category === "authorization"
        ? fixtures.authorizationCases.length
        : 0;
    assert((categories.get(category) ?? 0) + auxiliaryCount > 0, `required category missing: ${category}`);
  }
  assert(safeCount >= 8, "safe corpus is too small");
  assert(unsafeCount >= 45, "unsafe corpus is too small");
  assert(fixtures.semanticCases.length >= 12, "semantic corpus is too small");
  assert(fixtures.stateCases.length >= 16, "state corpus is too small");
  assert(fixtures.failureCases.length >= 9, "failure-injection corpus is too small");

  const phoneFamily = fixtures.mutationFamilies.find(({ id }) => id === "phone-every-digit");
  assert(phoneFamily?.kind === "each_digit_every_alternate", "phone mutation family missing");
  assert(phoneFamily.baseline.length === 10 && /^\d{10}$/u.test(phoneFamily.baseline), "phone baseline invalid");
  assert(phoneFamily.expectedCount === phoneFamily.baseline.length * 9, "phone mutation count contradictory");
  const generatedMutationCount = fixtures.mutationFamilies.reduce((total, family) => {
    if (family.kind === "each_digit_every_alternate") return total + family.expectedCount;
    assert(Array.isArray(family.replacements) && family.replacements.length > 0, `${family.id}: replacements missing`);
    assert(!family.replacements.includes(family.baseline), `${family.id}: baseline repeated as mutation`);
    assert(new Set(family.replacements).size === family.replacements.length, `${family.id}: duplicate mutation`);
    return total + family.replacements.length;
  }, 0);
  assert(generatedMutationCount >= 110, "generated mutation scale is too small");

  const contactIds = new Set(fixtures.contacts.map(({ id }) => id));
  const productIds = new Set(fixtures.products.map(({ id }) => id));
  for (const fixture of fixtures.transcriptCases) {
    for (const id of fixture.contactIds ?? []) assert(contactIds.has(id), `${fixture.id}: unknown contact ${id}`);
    for (const id of fixture.productIds ?? []) assert(productIds.has(id), `${fixture.id}: unknown product ${id}`);
  }
  for (const family of fixtures.mutationFamilies) {
    for (const id of family.productIds ?? []) assert(productIds.has(id), `${family.id}: unknown product ${id}`);
  }

  const schemaText = await readFile(join(directory, "voice-verifier-v1-adversarial-db-schema.sql"), "utf8");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(schemaText);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
      .map((row) => String((row as { name: unknown }).name));
    assert(tables.join(",") === "voice_adversarial_audit,voice_confirmation_attempts,voice_proposals", "isolated schema tables invalid");
  } finally {
    db.close();
  }

  const fixtureText = await readFile(join(directory, "voice-verifier-v1-adversarial-fixtures.json"), "utf8");
  const thresholdText = await readFile(join(directory, "voice-verifier-v1-adversarial-thresholds.json"), "utf8");
  return {
    valid: true,
    safeExplicitCases: safeCount,
    unsafeExplicitCases: unsafeCount,
    semanticCases: fixtures.semanticCases.length,
    generatedMutationCases: generatedMutationCount,
    stateCases: fixtures.stateCases.length,
    authorizationCases: fixtures.authorizationCases.length,
    failureCases: fixtures.failureCases.length,
    categories: Object.fromEntries([...categories.entries()].sort(([left], [right]) => left.localeCompare(right))),
    hashes: {
      fixtures: sha256(fixtureText),
      thresholds: sha256(thresholdText),
      isolatedDatabaseSchema: sha256(schemaText),
    },
    repositoryRoot,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void validateVoiceVerifierV1AdversarialFreezeInputs()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Adversarial fixture validation failed.");
      process.exitCode = 1;
    });
}
