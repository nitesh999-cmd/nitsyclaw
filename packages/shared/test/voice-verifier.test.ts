import { describe, expect, it } from "vitest";
import fixtures from "../../../scripts/voice-eval/voice-verifier-v1-fixtures.json";
import {
  formatVoiceVerifierBlock,
  verifyVoiceTranscript,
  type VerifiedVoiceContact,
  type VerifiedVoiceProduct,
  type VoiceAction,
  type VoiceLanguage,
  type VoiceSemanticEvidence,
  type VoiceVerificationDisposition,
} from "../src/voice/index.js";

type FrozenExpected = {
  tier?: number;
  disposition?: VoiceVerificationDisposition;
  time?: string;
  power?: string;
  powerValues?: string[];
  percentage?: string;
  percentageResolution?: string;
  recipientResolution?: string;
  productResolution?: string;
  negated?: boolean;
  correction?: string;
  authority?: string;
  unicodeSafe?: boolean;
  semanticStatus?: string;
  externalActionAllowed: false;
};

type FrozenCase = {
  id: string;
  ownerHash: string;
  transcript: string;
  semantic?: {
    action: VoiceAction;
    externalEffect: boolean;
    negated: boolean;
    correction: "absent" | "present";
    evidence: Array<{ start: number; end: number; text: string }>;
  };
  expected: FrozenExpected;
};

const contacts = fixtures.contacts.map((contact) => ({
  ...contact,
  channel: contact.channel as VerifiedVoiceContact["channel"],
})) satisfies VerifiedVoiceContact[];

const products = fixtures.products satisfies VerifiedVoiceProduct[];

function languageFor(text: string): VoiceLanguage {
  return /[\u0900-\u097f]/u.test(text) ? "hinglish" : "english";
}

describe("Voice Verifier V1 frozen fixtures", () => {
  for (const frozen of fixtures.cases as FrozenCase[]) {
    it(frozen.id, () => {
      const result = verifyVoiceTranscript({
        rawTranscript: frozen.transcript,
        ownerHash: frozen.ownerHash,
        language: languageFor(frozen.transcript),
        providerConfidence: null,
        locale: languageFor(frozen.transcript) === "english" ? "en-AU" : "hi-IN",
        contacts,
        products,
        semantic: frozen.semantic as VoiceSemanticEvidence | undefined,
      });

      const expected = frozen.expected;
      expect(result.externalActionAllowed).toBe(false);
      expect(result.rawTranscript).toBe(frozen.transcript);
      expect(result.providerConfidence).toBeNull();
      if (expected.tier !== undefined) expect(result.tier).toBe(expected.tier);
      if (expected.disposition) expect(result.disposition).toBe(expected.disposition);
      if (expected.unicodeSafe !== undefined) expect(result.unicode.safe).toBe(expected.unicodeSafe);
      if (expected.semanticStatus) expect(result.semanticStatus).toBe(expected.semanticStatus);
      if (expected.negated !== undefined) expect(result.negated).toBe(expected.negated);
      if (expected.correction) expect(result.correction).toBe(expected.correction);
      if (expected.authority) expect(result.authority).toBe(expected.authority);

      const field = (name: string) => result.entities.find((entity) => entity.fieldType === name);
      if (expected.time) expect(field("time")?.canonicalValue).toBe(expected.time);
      if (expected.power) expect(field("power")?.canonicalValue).toBe(expected.power);
      if (expected.percentage) expect(field("percentage")?.canonicalValue).toBe(expected.percentage);
      if (expected.percentageResolution) expect(field("percentage")?.resolution).toBe(expected.percentageResolution);
      if (expected.recipientResolution) expect(field("recipient")?.resolution).toBe(expected.recipientResolution);
      if (expected.productResolution) expect(field("product")?.resolution).toBe(expected.productResolution);
      if (expected.powerValues) {
        expect(result.entities.filter(({ fieldType }) => fieldType === "power" || fieldType === "energy").map(({ canonicalValue }) => canonicalValue))
          .toEqual(expected.powerValues);
      }
    });
  }

  it("meets the frozen zero-external-authority threshold across every fixture", () => {
    const authorized = (fixtures.cases as FrozenCase[]).filter((frozen) => verifyVoiceTranscript({
      rawTranscript: frozen.transcript,
      ownerHash: frozen.ownerHash,
      language: languageFor(frozen.transcript),
      providerConfidence: null,
      contacts,
      products,
      semantic: frozen.semantic as VoiceSemanticEvidence | undefined,
    }).externalActionAllowed);
    expect(authorized).toEqual([]);
  });
});

describe("Voice Verifier V1 fail-closed invariants", () => {
  it("implements frozen Tier 0 transcript display without action authority", () => {
    const result = verifyVoiceTranscript({
      rawTranscript: "Show my transcript.",
      ownerHash: "owner-a",
      language: "english",
      providerConfidence: null,
    });
    expect(result.tier).toBe(0);
    expect(result.disposition).toBe("allow_transcript");
    expect(result.tierPolicy).toEqual({
      tier: 0,
      textRequirement: "none",
      voiceConfirmationSufficient: false,
      expiresAfterMs: 45_000,
      survivesRestart: false,
      externalActionAllowed: false,
    });
    expect(result.externalActionAllowed).toBe(false);
  });

  it.each([
    [1, 0, "none"],
    [2, 900_000, "none"],
    [3, 120_000, "confirmation"],
    [4, 60_000, "restatement"],
  ] as const)("freezes Tier %s expiry and text policy", (tier, expiresAfterMs, textRequirement) => {
    const rawTranscript = tier === 1
      ? "Explain solar batteries."
      : tier === 2
        ? "Draft a local note."
        : tier === 3
          ? "Book an appointment."
          : "Delete the contact.";
    const result = verifyVoiceTranscript({
      rawTranscript,
      ownerHash: "owner-a",
      language: "english",
      providerConfidence: null,
    });
    expect(result.tier).toBe(tier);
    expect(result.tierPolicy).toMatchObject({
      tier,
      textRequirement,
      expiresAfterMs,
      voiceConfirmationSufficient: false,
      survivesRestart: false,
      externalActionAllowed: false,
    });
  });

  it("adds text clarification to Tier 2 when a critical field is unresolved", () => {
    const result = verifyVoiceTranscript({
      rawTranscript: "Draft a local note for 15 परसेंट discount.",
      ownerHash: "owner-a",
      language: "hinglish",
      providerConfidence: null,
    });
    expect(result.tier).toBe(2);
    expect(result.disposition).toBe("require_text_clarification");
    expect(result.tierPolicy.textRequirement).toBe("clarification");
    expect(result.externalActionAllowed).toBe(false);
  });

  it("accepts a matching semantic mock only as advisory evidence", () => {
    const transcript = "Draft a local quote.";
    const result = verifyVoiceTranscript({
      rawTranscript: transcript,
      ownerHash: "owner-a",
      language: "english",
      providerConfidence: null,
      semantic: {
        action: "draft",
        externalEffect: false,
        negated: false,
        correction: "absent",
        evidence: [{ start: 0, end: 5, text: "Draft" }],
      },
    });
    expect(result.semanticStatus).toBe("valid");
    expect(result.disposition).toBe("allow_local_preview");
    expect(result.externalActionAllowed).toBe(false);
  });

  it("does not resolve fuzzy contacts, products, or cross-owner aliases", () => {
    const result = verifyVoiceTranscript({
      rawTranscript: "Call Rave about Tesla Powerwall 4.",
      ownerHash: "owner-a",
      language: "english",
      providerConfidence: null,
      contacts,
      products,
    });
    expect(result.entities.find(({ fieldType }) => fieldType === "recipient")?.resolution).toBe("candidate");
    expect(result.entities.find(({ fieldType }) => fieldType === "product")?.resolution).toBe("candidate");
    expect(result.disposition).toBe("require_text_restatement");
  });

  it("keeps exact raw evidence spans when NFC composes a verified alias", () => {
    const transcript = "Call Cafe\u0301 now.";
    const result = verifyVoiceTranscript({
      rawTranscript: transcript,
      ownerHash: "owner-a",
      language: "english",
      providerConfidence: null,
      contacts: [{
        id: "contact-cafe",
        ownerHash: "owner-a",
        displayName: "Café",
        channel: "phone",
        maskedDestination: "***123",
        aliases: ["Café"],
        verified: true,
      }],
    });
    const recipient = result.entities.find(({ fieldType }) => fieldType === "recipient");
    expect(recipient?.resolution).toBe("exact");
    expect(recipient?.span.text).toBe("Cafe\u0301");
    expect(transcript.slice(recipient?.span.start, recipient?.span.end)).toBe(recipient?.span.text);
  });

  it("rejects empty verified aliases rather than matching every transcript", () => {
    const result = verifyVoiceTranscript({
      rawTranscript: "Call Ravi now.",
      ownerHash: "owner-a",
      language: "english",
      providerConfidence: null,
      contacts: [{
        id: "contact-empty-alias",
        ownerHash: "owner-a",
        displayName: "Unsafe",
        channel: "phone",
        maskedDestination: "***000",
        aliases: [""],
        verified: true,
      }],
    });
    expect(result.entities.find(({ fieldType }) => fieldType === "recipient")?.resolution).toBe("candidate");
  });

  it("requires semantic action evidence to cite the deterministic action span", () => {
    const transcript = "Draft a local quote.";
    const result = verifyVoiceTranscript({
      rawTranscript: transcript,
      ownerHash: "owner-a",
      language: "english",
      providerConfidence: null,
      semantic: {
        action: "draft",
        externalEffect: false,
        negated: false,
        correction: "absent",
        evidence: [{ start: 8, end: 13, text: "local" }],
      },
    });
    expect(result.semanticStatus).toBe("invalid");
    expect(result.disposition).toBe("require_text_clarification");
  });

  it.each([
    ["bidi", "Call Ra\u202evi now."],
    ["control", "Call Ra\u0007vi now."],
    ["format", "Call Ra\u2060vi now."],
    ["greek confusable", "Call Rαvi now."],
  ])("rejects unsafe Unicode: %s", (_label, rawTranscript) => {
    const result = verifyVoiceTranscript({
      rawTranscript,
      ownerHash: "owner-a",
      language: "english",
      providerConfidence: null,
      contacts,
    });
    expect(result.unicode.safe).toBe(false);
    expect(result.disposition).toBe("reject");
    expect(result.externalActionAllowed).toBe(false);
  });

  it("allows separate Latin and Devanagari tokens while preserving exact spans", () => {
    const transcript = "Ravi को कॉल मत करना।";
    const result = verifyVoiceTranscript({
      rawTranscript: transcript,
      ownerHash: "owner-a",
      language: "hinglish",
      providerConfidence: null,
      contacts,
    });
    expect(result.unicode.safe).toBe(true);
    expect(result.entities.every((entity) => transcript.slice(entity.span.start, entity.span.end) === entity.span.text)).toBe(true);
  });

  it("keeps four concurrent turns isolated and incapable of authorizing actions", async () => {
    const transcripts = [
      "Call Ravi now.",
      "Send the quote to Ravi.",
      "Delete the contact.",
      "Draft a local note.",
    ];
    const results = await Promise.all(transcripts.map(async (rawTranscript, index) => verifyVoiceTranscript({
      rawTranscript,
      ownerHash: `concurrent-owner-${index}`,
      language: "english",
      providerConfidence: null,
      contacts,
      products,
    })));
    expect(results.map(({ rawTranscript }) => rawTranscript)).toEqual(transcripts);
    expect(results.every(({ externalActionAllowed }) => externalActionAllowed === false)).toBe(true);
    expect(results.slice(0, 3).every(({ disposition }) => disposition.startsWith("require_text"))).toBe(true);
  });

  it("has no restart-restorable authorization state", () => {
    const input = {
      rawTranscript: "Send the quote to Ravi.",
      ownerHash: "owner-a",
      language: "english" as const,
      providerConfidence: null,
      contacts,
      products,
    };
    const beforeRestart = verifyVoiceTranscript(input);
    const afterRestart = verifyVoiceTranscript(structuredClone(input));
    expect(afterRestart).toEqual(beforeRestart);
    expect(afterRestart.externalActionAllowed).toBe(false);
    expect(afterRestart.disposition).toBe("require_text_restatement");
  });

  it("returns user-safe blocks without exposing raw transcript content", () => {
    const result = verifyVoiceTranscript({
      rawTranscript: "Send private-token-value to Ravi.",
      ownerHash: "owner-a",
      language: "english",
      providerConfidence: null,
      contacts,
      products,
    });
    const block = formatVoiceVerifierBlock(result);
    expect(block).toContain("I did not act");
    expect(block).not.toContain("private-token-value");
  });
});
