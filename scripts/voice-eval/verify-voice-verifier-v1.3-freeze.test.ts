import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  validateVoiceVerifierV13Corpus,
  verifyVoiceVerifierV13AdversarialFreeze,
} from "./verify-voice-verifier-v1.3-adversarial-freeze.js";

/**
 * The V1.2 chain broke silently: no test and no CI step ran any voice freeze
 * verifier, so a snapped hash chain stayed green through lint, typecheck and
 * the full suite. This test is the gate that makes that impossible for V1.3.
 */

const directory = dirname(fileURLToPath(import.meta.url));

describe("Voice Verifier V1.3 freeze integrity", () => {
  it("verifies the frozen V1.3 chain end to end", async () => {
    const frozen = await verifyVoiceVerifierV13AdversarialFreeze();
    expect(frozen.schemaVersion).toBe("NITSYCLAW-VOICE-VERIFIER-V1.3-ADVERSARIAL-FREEZE");
    expect(frozen.immutableFiles.length).toBeGreaterThan(0);
  });

  it("validates the corpus and records what it supersedes", async () => {
    const result = await validateVoiceVerifierV13Corpus();
    expect(result.valid).toBe(true);
    expect(result.supersedes).toBe("NITSYCLAW-VOICE-VERIFIER-V1.2-ADVERSARIAL-CORPUS");
    expect(result.supersededArtifacts as number).toBeGreaterThan(0);
  });

  it("keeps the corrected binding fixture expectation, so the six-mutation false negative stays closed", async () => {
    const fixtures = JSON.parse(
      await readFile(join(directory, "voice-verifier-v1.1-adversarial-fixtures.json"), "utf8"),
    ) as { persistenceCases: Array<{ id: string; expectedRejected: boolean }> };
    const corrected = fixtures.persistenceCases.find(({ id }) => id === "db-token-binding-all-identity-fields");
    expect(corrected?.expectedRejected).toBe(false);
  });

  it("still records every pre-correction digest against the untouched V1.2 record", async () => {
    const corpus = JSON.parse(
      await readFile(join(directory, "voice-verifier-v1.3-adversarial-corpus.json"), "utf8"),
    ) as { priorChain: Array<{ path: string; previousSha256?: string; supersededReason?: string }> };
    const superseded = corpus.priorChain.filter(({ previousSha256 }) => previousSha256 !== undefined);
    expect(superseded.length).toBe(3);
    for (const entry of superseded) {
      expect(entry.supersededReason, `${entry.path} has no supersession reason`).toBeTruthy();
    }
  });
});
