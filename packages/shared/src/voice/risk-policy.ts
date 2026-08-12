import type {
  VoiceAction,
  VoiceActionEvidence,
  VoiceEvidenceSpan,
  VoiceRiskTier,
  VoiceTierPolicy,
  VoiceTypedEntity,
  VoiceVerificationDisposition,
} from "./types.js";

const ACTION_PATTERNS: Array<{ action: VoiceAction; externalEffect: boolean; pattern: RegExp }> = [
  { action: "transcribe", externalEffect: false, pattern: /\b(?:show|display|read)\s+(?:(?:the|my)\s+)?transcript\b|(?:ट्रांसक्रिप्ट|लिप्यंतरण)\s+(?:दिखाओ|पढ़ो)/iu },
  { action: "delete", externalEffect: true, pattern: /\b(?:delete|remove|erase|wipe)\b|(?:डिलीट|हटाओ|हटा\s+देना|मिटाओ)/iu },
  { action: "pay", externalEffect: true, pattern: /\b(?:pay|transfer|refund|spend|remit)\b|(?:पेमेंट|भुगतान|ट्रांसफर|चुका(?:ओ|\s+दो)?)/iu },
  { action: "order", externalEffect: true, pattern: /\b(?:order|purchase|buy)\b|(?:ऑर्डर|खरीद|मंगवा(?:ओ|\s+दो)?)/iu },
  { action: "account", externalEffect: true, pattern: /\b(?:connect|authorize|authorise|login|account)\b|(?:अकाउंट|लॉगिन|कनेक्ट)/iu },
  { action: "confirm", externalEffect: true, pattern: /\b(?:confirm|approve|go\s+ahead)\b|(?:पुष्टि|मंजूर)/iu },
  { action: "cancel", externalEffect: true, pattern: /\b(?:cancel|abort|withdraw)\b|(?:रद्द|कैंसल)/iu },
  { action: "send", externalEffect: true, pattern: /\b(?:send|message|text|email|forward|share|post|publish|dispatch|deliver|ping|reach\s+out)\b|(?:भेजो|भेजना|मैसेज|ईमेल|पहुँचा(?:ओ|\s+दो)?)/iu },
  { action: "call", externalEffect: true, pattern: /\b(?:call|phone|ring)\b|(?:कॉल|फोन|फ़ोन)(?:\s+लगाओ)?/iu },
  { action: "book", externalEffect: true, pattern: /\b(?:book|schedule|reserve|appointment|arrange)\b|(?:बुक|शेड्यूल|अपॉइंटमेंट|समय\s+तय)/iu },
  { action: "draft", externalEffect: false, pattern: /\b(?:draft|prepare|compose)\b|(?:ड्राफ्ट|तैयार)/iu },
  { action: "retrieve", externalEffect: false, pattern: /\b(?:show|find|retrieve|read|open|get)\b|(?:दिखाओ|ढूँढो|पढ़ो)/iu },
  { action: "check_quote", externalEffect: false, pattern: /(?:\bquote\b|कोट|क्वोट)[\s\S]{0,80}(?:\bcheck\b|चेक)|(?:\bcheck\b|चेक)[\s\S]{0,80}(?:\bquote\b|कोट|क्वोट)/iu },
  { action: "check", externalEffect: false, pattern: /\bcheck\b|चेक/iu },
];

function firstSpan(text: string, pattern: RegExp): VoiceEvidenceSpan | null {
  const match = text.match(pattern);
  if (match?.index === undefined) return null;
  return { start: match.index, end: match.index + match[0].length, text: match[0] };
}

export function detectVoiceActions(text: string): VoiceActionEvidence[] {
  const actions: VoiceActionEvidence[] = [];
  for (const candidate of ACTION_PATTERNS) {
    if (candidate.action === "check" && actions.some(({ action }) => action === "check_quote")) continue;
    const span = firstSpan(text, candidate.pattern);
    if (span) actions.push({ action: candidate.action, externalEffect: candidate.externalEffect, span });
  }
  return actions;
}

export function voiceNegationPresent(text: string): boolean {
  return /\b(?:no|not|never|don['’]?t|do\s+not)\b|(?:नहीं|नही|मत)|\b(?:nahi|nahin|mat)\b/iu.test(text);
}

export function voiceCorrectionPresent(text: string): boolean {
  return /\b(?:no[, ]+|actually|i\s+mean|rather|correction)\b|(?:मेरा मतलब|नहीं[, ]+)|\b(?:matlab)\b/iu.test(text);
}

export function voiceAuthority(text: string): "direct" | "discussion" | "quoted_or_background" {
  if (/\b(?:the\s+(?:tv|television|radio|podcast|video|note)|someone|they|he|she)\s+(?:said|says|is\s+saying|reads?)|\b(?:quoted|reading\s+aloud)\b/iu.test(text)) {
    return "quoted_or_background";
  }
  if (/^\s*(?:how\s+do\s+i|how\s+can\s+i|what\s+(?:does|happens|would\s+happen)|can\s+i|should\s+i|why\s+would\s+i)\b/iu.test(text)) {
    return "discussion";
  }
  return "direct";
}

export function voicePromptInjectionPresent(text: string): boolean {
  return /\bexternalActionAllowed\b|\b(?:call|invoke|run)\s+(?:the\s+)?tool\b|\bapproval\s*=\s*true\b|\bsend_message\b/iu.test(text);
}

export function classifyVoiceRiskTier(args: {
  actions: VoiceActionEvidence[];
  entities: VoiceTypedEntity[];
  correction: boolean;
  authority: "direct" | "discussion" | "quoted_or_background";
}): VoiceRiskTier {
  if (args.authority === "discussion") return 1;
  if (args.authority === "quoted_or_background") return 4;
  const actionSet = new Set(args.actions.map(({ action }) => action));
  const recipient = args.entities.some(({ fieldType }) => fieldType === "recipient");
  const consequential = ["delete", "pay", "order", "account", "confirm", "cancel"].some((action) => actionSet.has(action as VoiceAction));
  const externalEffect = args.actions.some((action) => action.externalEffect);
  if (consequential || args.correction || (recipient && externalEffect)) return 4;
  if (["send", "call", "book"].some((action) => actionSet.has(action as VoiceAction))) return 3;
  if (actionSet.has("transcribe")) return 0;
  if (["draft", "retrieve", "check", "check_quote"].some((action) => actionSet.has(action as VoiceAction))) return 2;
  return args.actions.length === 0 ? 1 : 1;
}

export function voiceDisposition(args: {
  unicodeSafe: boolean;
  tier: VoiceRiskTier;
  entities: VoiceTypedEntity[];
  semanticStatus: import("./types.js").VoiceSemanticStatus;
  negated: boolean;
  correction: boolean;
  authority: "direct" | "discussion" | "quoted_or_background";
  promptInjection: boolean;
}): VoiceVerificationDisposition {
  if (!args.unicodeSafe || args.promptInjection) return "reject";
  if (args.tier >= 4 || args.negated || args.correction || args.authority === "quoted_or_background") {
    return "require_text_restatement";
  }
  if (args.tier === 3) return "require_text_confirmation";
  if (!["unavailable", "valid"].includes(args.semanticStatus)) return "require_text_clarification";
  const unresolved = args.entities.some(({ resolution }) => resolution !== "exact");
  if (args.tier === 2) return unresolved ? "require_text_clarification" : "allow_local_preview";
  if (args.tier === 0) return "allow_transcript";
  return "allow_conversation";
}

export function voiceTierPolicy(
  tier: VoiceRiskTier,
  disposition: VoiceVerificationDisposition,
): VoiceTierPolicy {
  const expiresAfterMs = tier === 0
    ? 45_000
    : tier === 1
      ? 0
      : tier === 2
        ? 15 * 60_000
        : tier === 3
          ? 2 * 60_000
          : 60_000;
  const textRequirement = disposition === "require_text_clarification"
    ? "clarification"
    : disposition === "require_text_confirmation"
      ? "confirmation"
      : disposition === "require_text_restatement" || disposition === "reject"
        ? "restatement"
        : "none";
  return {
    tier,
    textRequirement,
    voiceConfirmationSufficient: false,
    expiresAfterMs,
    survivesRestart: false,
    externalActionAllowed: false,
  };
}
