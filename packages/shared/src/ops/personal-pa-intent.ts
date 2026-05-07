export type PersonalPaIntentKind = "actionable" | "needs_clarification" | "approval_required";

export interface PersonalPaIntentDecision {
  kind: PersonalPaIntentKind;
  reason: string;
  question?: string;
  userFacingText: string;
}

const RISKY_ACTION_RE = /\b(send|message|text|email|call|delete|remove|pay|spend|buy|purchase|order|post|publish|deploy|production|refund|transfer|cancel|book|schedule|appointment)\b/i;
const ACTION_RE = /\b(compare|find|research|summari[sz]e|explain|draft|write|prepare|plan|check|sort|save|remember|remind|create|make|look|help|choose|recommend|analyse|analyze|weather|forecast)\b/i;
const VAGUE_REFERENCE_RE = /\b(him|her|them|it|this|that|someone|something|there)\b/i;
const EMOTIONAL_RE = /\b(stressed|overwhelmed|angry|upset|annoyed|panic|worried|scared|tired|too much|can't deal|cannot deal|fed up|frustrated)\b/i;
const SMALL_TALK_OR_CONFIRMATION_RE = /^(hi|hello|hey|yo|yes|yep|yeah|ok|okay|no|thanks|thank you)[.!? ]*$/i;
const FEATURE_CAPTURE_RE = /^(\/addfeature|feature request:|add feature\b|new feature\b|bug:|problem:)/i;

export function analyzePersonalPaIntent(input: string): PersonalPaIntentDecision {
  const text = input.trim();

  if (FEATURE_CAPTURE_RE.test(text)) {
    return actionable();
  }

  if (SMALL_TALK_OR_CONFIRMATION_RE.test(text)) {
    return actionable();
  }

  if (text.length < 4) {
    return clarification("short_input", "What would you like me to help with?");
  }

  if (hasVagueRiskyReference(text)) {
    return clarification(
      "vague_risky_reference",
      "Who or what do you mean, and what should I do?",
    );
  }

  if (EMOTIONAL_RE.test(text) && !ACTION_RE.test(text)) {
    return {
      kind: "needs_clarification",
      reason: "emotional_unclear",
      question: "What is the main thing you want me to help with right now?",
      userFacingText:
        "I hear you. What is the main thing you want me to help with right now?",
    };
  }

  if (isRiskyPersonalPaAction(text)) {
    return {
      kind: "approval_required",
      reason: "external_or_destructive_action",
      userFacingText: "Saved. Needs your approval before I act.",
    };
  }

  if (!ACTION_RE.test(text) && text.split(/\s+/).length <= 5) {
    return clarification("unclear_goal", "What outcome do you want from this?");
  }

  return actionable();
}

export function isRiskyPersonalPaAction(input: string): boolean {
  return RISKY_ACTION_RE.test(input);
}

function actionable(): PersonalPaIntentDecision {
  return {
    kind: "actionable",
    reason: "clear_safe_request",
    userFacingText: "Saved. Working on it.",
  };
}

function hasVagueRiskyReference(text: string): boolean {
  if (/\bto\s+[A-Z][a-z]+/.test(text)) return false;
  return RISKY_ACTION_RE.test(text) && VAGUE_REFERENCE_RE.test(text);
}

function clarification(reason: string, question: string): PersonalPaIntentDecision {
  return {
    kind: "needs_clarification",
    reason,
    question,
    userFacingText: question,
  };
}
