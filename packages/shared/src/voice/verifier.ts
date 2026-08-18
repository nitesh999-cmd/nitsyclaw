import { extractDeterministicVoiceEntities, normalizeVoiceView } from "./canonicalize.js";
import { resolveVoiceProduct, resolveVoiceRecipient } from "./resolution.js";
import {
  classifyVoiceRiskTier,
  detectVoiceActions,
  voiceAuthority,
  voiceCorrectionPresent,
  voiceDisposition,
  voiceNegationPresent,
  voicePromptInjectionPresent,
  voiceTierPolicy,
} from "./risk-policy.js";
import { inspectVoiceUnicode } from "./unicode-policy.js";
import type {
  VoiceActionEvidence,
  VoiceSemanticEvidence,
  VoiceSemanticLifecycle,
  VoiceSemanticStatus,
  VoiceVerificationInput,
  VoiceVerificationResult,
} from "./types.js";

const SEMANTIC_KEYS = new Set(["action", "externalEffect", "negated", "correction", "evidence"]);
const SEMANTIC_ACTIONS = new Set([
  "transcribe", "answer", "retrieve", "draft", "check", "check_quote", "cancel", "send", "call", "book",
  "order", "pay", "delete", "account", "confirm", "unknown",
]);

const LIFECYCLE_STATUS = {
  timeout: ["timeout", "semantic_timeout"],
  late_after_timeout: ["late_rejected", "semantic_late_after_timeout"],
  cancelled: ["cancelled_rejected", "semantic_after_cancellation"],
  previous_process: ["restart_rejected", "semantic_after_restart"],
  partial: ["partial_rejected", "semantic_partial_output"],
} as const satisfies Record<VoiceSemanticLifecycle["state"], readonly [VoiceSemanticStatus, string]>;

const LIFECYCLE_KEYS = new Set(["state", "requestId", "processEpoch", "currentProcessEpoch"]);

function semanticLifecycleStatus(
  lifecycle: VoiceSemanticLifecycle | undefined,
): readonly [VoiceSemanticStatus, string] | undefined {
  if (lifecycle === undefined) return undefined;
  if (!lifecycle || typeof lifecycle !== "object" || Array.isArray(lifecycle)) {
    return LIFECYCLE_STATUS.partial;
  }
  const value = lifecycle as unknown as Record<string, unknown>;
  if (!hasOnlyKeys(value, LIFECYCLE_KEYS)
    || typeof value.state !== "string"
    || !(value.state in LIFECYCLE_STATUS)
    || typeof value.requestId !== "string"
    || value.requestId.length === 0
    || typeof value.processEpoch !== "string"
    || value.processEpoch.length === 0) {
    return LIFECYCLE_STATUS.partial;
  }
  if (value.state === "previous_process"
    && (typeof value.currentProcessEpoch !== "string"
      || value.currentProcessEpoch.length === 0
      || value.currentProcessEpoch === value.processEpoch)) {
    return LIFECYCLE_STATUS.partial;
  }
  return LIFECYCLE_STATUS[value.state as VoiceSemanticLifecycle["state"]];
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function semanticStatus(
  rawTranscript: string,
  semantic: VoiceSemanticEvidence | undefined,
  actions: VoiceActionEvidence[],
  negated: boolean,
  correction: boolean,
): VoiceSemanticStatus {
  if (semantic === undefined) return "unavailable";
  if (!semantic || typeof semantic !== "object" || Array.isArray(semantic)) return "invalid";
  const value = semantic as unknown as Record<string, unknown>;
  if (!hasOnlyKeys(value, SEMANTIC_KEYS)
    || !SEMANTIC_ACTIONS.has(value.action as string)
    || typeof value.externalEffect !== "boolean"
    || typeof value.negated !== "boolean"
    || (value.correction !== "absent" && value.correction !== "present")
    || !Array.isArray(value.evidence)
    || value.evidence.length === 0) return "invalid";
  const allowedSpanKeys = new Set(["start", "end", "text"]);
  for (const candidate of value.evidence) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)
      || !hasOnlyKeys(candidate as Record<string, unknown>, allowedSpanKeys)) return "invalid";
    const span = candidate as Record<string, unknown>;
    if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || typeof span.text !== "string") return "invalid";
  }
  const spans = semantic.evidence;
  for (const span of spans) {
    if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end <= span.start || span.end > rawTranscript.length) {
      return "invalid";
    }
    if (rawTranscript.slice(span.start, span.end) !== span.text) return "invalid";
  }
  const ordered = [...spans].sort((left, right) => left.start - right.start || left.end - right.end);
  if (ordered.some((span, index) => index > 0 && span.start < ordered[index - 1]!.end)) return "invalid";
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
  const entities = extractDeterministicVoiceEntities(rawTranscript, input.locale, input.temporalContext);
  const recipient = resolveVoiceRecipient({
    text: rawTranscript,
    ownerHash: input.ownerHash,
    contacts: input.contacts ?? [],
    requiredChannel: input.requiredRecipientChannel,
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
  const promptInjection = voicePromptInjectionPresent(rawTranscript);
  const lifecycle = semanticLifecycleStatus(input.semanticLifecycle);
  const semantics = lifecycle?.[0]
    ?? semanticStatus(rawTranscript, input.semantic, actions, negated, correctionPresent);
  const tier = classifyVoiceRiskTier({ actions, entities, correction: correctionPresent, authority });
  let disposition = rawTranscript.trim()
    ? voiceDisposition({
        unicodeSafe: unicode.safe,
        tier,
        entities,
        semanticStatus: semantics,
        negated,
        correction: correctionPresent,
        authority,
        promptInjection,
      })
    : "reject";

  const ambiguousCheck = actions.some(({ action }) => action === "check")
    && !actions.some(({ action }) => action === "check_quote")
    && /^\s*(?:please\s+)?(?:check|चेक)(?:\s+(?:it|this|that|them|इसे|यह))?\s*[.!?]*\s*$/iu.test(rawTranscript);
  if (ambiguousCheck && disposition === "allow_local_preview") disposition = "require_text_clarification";

  const reasons: string[] = [];
  if (!rawTranscript.trim()) reasons.push("empty_transcript");
  if (!unicode.safe) reasons.push("unicode_rejected");
  if (input.providerConfidence === null) reasons.push("provider_confidence_unavailable");
  if (semantics === "invalid") reasons.push("semantic_evidence_invalid");
  if (semantics === "disagrees") reasons.push("semantic_evidence_disagrees");
  if (lifecycle) reasons.push(lifecycle[1]);
  if (ambiguousCheck) reasons.push("check_object_ambiguous");
  const weekday = entities.find(({ raw }) => /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/iu.test(raw));
  if (weekday?.resolution === "ambiguous") reasons.push("weekday_anchor_missing");
  if (input.temporalContext && input.temporalContext.version !== input.temporalContext.currentVersion) {
    reasons.push("temporal_context_stale");
  } else if (weekday?.resolution === "rejected") {
    reasons.push("weekday_date_conflict");
  }
  if (entities.some(({ fieldType, resolution }) => fieldType === "time" && resolution === "rejected")) {
    reasons.push("local_time_nonexistent");
  }
  if (negated) reasons.push("negation_present");
  if (correctionPresent) reasons.push("correction_present");
  if (authority === "quoted_or_background") reasons.push("voice_authority_unclear");
  if (promptInjection) reasons.push("prompt_injection_rejected");
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
