import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { verifiedVoiceContacts, verifiedVoiceProducts } from "../src/db/schema.js";

describe("Voice Verifier V1 verified-directory schema", () => {
  it("exports owner-scoped verified contact and product tables", () => {
    expect(verifiedVoiceContacts.ownerHash).toBeDefined();
    expect(verifiedVoiceContacts.displayNameCiphertext).toBeDefined();
    expect(verifiedVoiceContacts.destinationCiphertext).toBeDefined();
    expect(verifiedVoiceContacts.destinationHash).toBeDefined();
    expect(verifiedVoiceContacts.aliasesCiphertext).toBeDefined();
    expect(verifiedVoiceContacts.aliasHashes).toBeDefined();
    expect(verifiedVoiceContacts.verificationMethod).toBeDefined();
    expect(verifiedVoiceContacts.verificationEvidenceHash).toBeDefined();
    expect(verifiedVoiceContacts.verifiedAt).toBeDefined();
    expect(verifiedVoiceContacts.revokedAt).toBeDefined();
    expect(verifiedVoiceProducts.ownerHash).toBeDefined();
    expect(verifiedVoiceProducts.canonicalKey).toBeDefined();
    expect(verifiedVoiceProducts.aliases).toBeDefined();
    expect(verifiedVoiceProducts.verificationMethod).toBeDefined();
    expect(verifiedVoiceProducts.verificationEvidenceHash).toBeDefined();
  });

  it("keeps plaintext destinations out of the migration and requires owner indexes", () => {
    const migration = readFileSync("packages/shared/drizzle/0011_voice_verification.sql", "utf8");
    expect(migration).toContain('"destination_ciphertext" text NOT NULL');
    expect(migration).toContain('"destination_hash" text NOT NULL');
    expect(migration).toContain('"display_name_ciphertext" text NOT NULL');
    expect(migration).toContain('"aliases_ciphertext" text NOT NULL');
    expect(migration).toContain('"alias_hashes" jsonb NOT NULL');
    expect(migration).not.toContain('"display_name" text');
    expect(migration).toContain('"verification_evidence_hash" text NOT NULL');
    expect(migration).not.toMatch(/phone_number|email_address|whatsapp_number/iu);
    expect(migration).toContain("verified_voice_contacts_owner_destination_unique_idx");
    expect(migration).toContain("verified_voice_products_owner_canonical_unique_idx");
  });

  it("registers the migration in the Drizzle journal", () => {
    const journal = readFileSync("packages/shared/drizzle/meta/_journal.json", "utf8");
    expect(journal).toContain('"tag": "0011_voice_verification"');
  });
});
