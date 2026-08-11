import { extractDeterministicVoiceEntities, normalizeVoiceView } from "./canonicalize.js";
import { resolveVoiceProduct, resolveVoiceRecipient } from "./resolution.js";
import {
  classifyVoiceRiskTier,
  detectVoiceActions,
  voiceAuthority,
  voiceCorrectionPresent,
  voiceDisposition,
  voiceNegationPresent,
  voiceTierPolicy,
} from "./risk-policy.js";
import { inspectVoiceUnicode } from "./unicode-policy.js";
import type {
  VoiceActionEvidence,
  VoiceSemanticEvidence,
  VoiceSemanticStatus,
  VoiceVerificationInput,
  VoiceVerificationResult,
} from "./types.js";

function semanticStatus(
  rawTranscript: string,
  semantic: VoiceSemanticEvidence | undefined,
  actions: VoiceActionEvidence[],
  negated: boolean,
  correction: boolean,
): VoiceSemanticStatus {
  if (!semantic) return "unavailable";
  if (!Array.isArray(semantic.evidence) || semantic.evidence.length === 0) return "invalid";
  for (const span of semantic.evidence) {
    if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end <= span.start || span.end > rawTranscript.length) {
      return "invalid";
    }
    if (rawTranscript.slice(span.start, span.end) !== span.text) return "invalid";
  }
  const deterministicActions = new Set(actions.map(({ action }) => action));
  const actionAgrees = deterministicActions.has(semantic.action)
    || (deterministicActions.size === 0 && ["answer", "unknown"].includes(semantic.action));
  if (!actionAgrees || semantic.negated !== negated || (semantic.correction === "present") !== correction) {
    return "disagrees";
  }
  const deterministicExternal = actions.some(({ externalEffect }) => externalEffect);
  if (semantic.externalEffect !== deterministicExternal) return "disagrees";
  const deterministicAction = actions.find(({ action }) => action === semantic.action);
  if (deterministicAction && !semantic.evidence.some((span) =>
    span.start === deterministicAction.span.start
      && span.end === deterministicAction.span.end
      && span.text === deterministicAction.span.text
  )) return "invalid";
  return "valid";
}

export function verifyVoiceTranscript(input: VoiceVerificationInput): VoiceVerificationResult {
  const rawTranscript = input.rawTranscript;
  const unicode = inspectVoiceUnicode(rawTranscript);
  const entities = extractDeterministicVoiceEntities(rawTranscript, input.locale);
  const recipient = resolveVoiceRecipient({
    text: rawTranscript,
    ownerHash: input.ownerHash,
    contacts: input.contacts ?? [],
  });
  const product = resolveVoiceProduct({
    text: rawTranscript,
    ownerHash: input.ownerHash,
    products: input.products ?? [],
  });
  if (recipient) entities.push(recipient);
  if (product) entities.push(product);

  const actions = detectVoiceActions(rawTranscript);
  const negated = voiceNegationPresent(rawTranscript);
  const correctionPresent = voiceCorrectionPresent(rawTranscript);
  const authority = voiceAuthority(rawTranscript);
  const semantics = semanticStatus(rawTranscript, input.semantic, actions, negated, correctionPresent);
  const tier = classifyVoiceRiskTier({ actions, entities, correction: correctionPresent, authority });
  const disposition = rawTranscript.trim()
    ? voiceDisposition({
        unicodeSafe: unicode.safe,
        tier,
        entities,
        semanticStatus: semantics,
        negated,
        correction: correctionPresent,
        authority,
      })
    : "reject";

  const reasons: string[] = [];
  if (!rawTranscript.trim()) reasons.push("empty_transcript");
  if (!unicode.safe) reasons.push("unicode_rejected");
  if (input.providerConfidence === null) reasons.push("provider_confidence_unavailable");
  if (semantics === "invalid") reasons.push("semantic_evidence_invalid");
  if (semantics === "disagrees") reasons.push("semantic_evidence_disagrees");
  if (negated) reasons.push("negation_present");
  if (correctionPresent) reasons.push("correction_present");
  if (authority === "quoted_or_background") reasons.push("voice_authority_unclear");
  if (entities.some(({ resolution }) => resolution === "ambiguous")) reasons.push("critical_field_ambiguous");
  if (entities.some(({ resolution }) => resolution === "candidate")) reasons.push("critical_field_unverified");
  if (tier >= 3) reasons.push("external_or_consequential_action_requires_text");

  return {
    schemaVersion: "NITSYCLAW-VOICE-VERIFIER-V1",
    rawTranscript,
    normalizedView: normalizeVoiceView(rawTranscript),
    language: input.language,
    providerConfidence: input.providerConfidence,
    unicode,
    entities,
    actions,
    negated,
    correction: correctionPresent ? "present" : "absent",
    authority,
    semanticStatus: semantics,
    tier,
    tierPolicy: voiceTierPolicy(tier, disposition),
    disposition,
    externalActionAllowed: false,
    reasons,
    policyVersion: "NITSYCLAW-VOICE-VERIFIER-V1",
  };
}

export function formatVoiceVerifierBlock(result: VoiceVerificationResult): string | null {
  switch (result.disposition) {
    case "require_text_restatement":
      return "I heard a possible consequential or unclear action. I did not act. Please restate the action, recipient, numbers, date, and product in text.";
    case "require_text_confirmation":
      return "I heard a possible external action. I did not act. Please restate it in text so I can show the exact confirmation details.";
    case "require_text_clarification":
      return "I kept the transcript, but a critical detail is ambiguous or unverified. I did not act. Please correct that detail in text.";
    case "reject":
      return "I could not safely verify that transcript. I did not act. Please resend the key instruction in plain text.";
    default:
      return null;
  }
}
