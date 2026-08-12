export type VoiceLanguage = "english" | "hindi" | "hinglish" | "mixed" | "unknown";

export type TranscriptionQuality = "high" | "medium" | "low";

export interface VoiceMediaFacts {
  container: "ogg" | "webm" | "mp4" | "mp3" | "wav";
  codec: "opus" | "aac" | "mp3" | "pcm";
  bytes: number;
  durationSeconds: number;
  channels: number;
  sampleRate: number;
  rmsDb: number;
  peak: number;
}

export interface TranscriptionResult {
  text: string;
  language: VoiceLanguage;
  /** Independent text/script/lexicon assessment, not provider metadata. */
  languageConfidence: number;
  /** Null when the local provider does not expose a calibrated probability. */
  providerConfidence: number | null;
  quality: TranscriptionQuality;
  /** Never fabricated. Empty when the provider cannot expose segment confidence. */
  uncertainSpans: Array<{ start: number; end: number; confidence: number }>;
  media: VoiceMediaFacts;
  timingsMs: {
    probe: number;
    decode: number;
    transcribe: number;
    total: number;
  };
}

export interface TranscriptionRequestOptions {
  filename?: string;
  declaredSizeBytes?: number;
  declaredDurationSeconds?: number;
  /** Sanitized, non-provider correlation id. */
  correlationId?: string;
  onProgress?: (stage: "validated" | "transcribing") => Promise<void> | void;
}

export interface SpeechSynthesisRequest {
  text: string;
  language: VoiceLanguage;
  correlationId?: string;
}

export interface SpeechSynthesisResult {
  audio: Buffer;
  mimetype: "audio/ogg; codecs=opus";
  filename: string;
  durationSeconds: number;
  language: VoiceLanguage;
  engine: string;
}

export type VoiceReplyMode = "text" | "voice" | "automatic";

export interface VoicePreferences {
  mode: VoiceReplyMode;
  language: VoiceLanguage | "preserve";
  brief: boolean;
}

export type VoiceRiskTier = 0 | 1 | 2 | 3 | 4;

export type VoiceVerificationDisposition =
  | "allow_transcript"
  | "allow_conversation"
  | "allow_local_preview"
  | "require_text_clarification"
  | "require_text_confirmation"
  | "require_text_restatement"
  | "reject";

export type VoiceResolutionState = "exact" | "candidate" | "ambiguous" | "missing" | "rejected";

export type VoiceCriticalFieldType =
  | "recipient"
  | "action"
  | "product"
  | "amount"
  | "percentage"
  | "date"
  | "time"
  | "timezone"
  | "location"
  | "phone"
  | "power"
  | "energy"
  | "negation"
  | "correction";

export interface VoiceEvidenceSpan {
  start: number;
  end: number;
  text: string;
}

export interface VoiceTypedEntity {
  id: string;
  fieldType: VoiceCriticalFieldType;
  raw: string;
  span: VoiceEvidenceSpan;
  canonicalValue: string | null;
  resolution: VoiceResolutionState;
  source: "deterministic" | "verified_contact" | "verified_product";
  recordId?: string;
  alternatives?: string[];
}

export interface VerifiedVoiceContact {
  id: string;
  ownerHash: string;
  displayName: string;
  channel: "whatsapp" | "sms" | "email" | "phone";
  maskedDestination: string;
  aliases: string[];
  verified: boolean;
}

export interface VerifiedVoiceProduct {
  id: string;
  ownerHash: string;
  canonicalKey: string;
  brand: string;
  model: string;
  aliases: string[];
  verified: boolean;
}

export type VoiceAction =
  | "transcribe"
  | "answer"
  | "retrieve"
  | "draft"
  | "check_quote"
  | "send"
  | "call"
  | "book"
  | "order"
  | "pay"
  | "delete"
  | "account"
  | "confirm"
  | "unknown";

export interface VoiceActionEvidence {
  action: VoiceAction;
  span: VoiceEvidenceSpan;
  externalEffect: boolean;
}

export interface VoiceSemanticEvidence {
  action: VoiceAction;
  externalEffect: boolean;
  negated: boolean;
  correction: "absent" | "present";
  evidence: VoiceEvidenceSpan[];
}

export type VoiceSemanticStatus = "unavailable" | "valid" | "invalid" | "disagrees";

export interface VoiceTierPolicy {
  tier: VoiceRiskTier;
  textRequirement: "none" | "clarification" | "confirmation" | "restatement";
  voiceConfirmationSufficient: false;
  expiresAfterMs: number;
  survivesRestart: false;
  externalActionAllowed: false;
}

export interface VoiceUnicodeAssessment {
  safe: boolean;
  normalized: string;
  issues: Array<{
    kind: "control" | "format" | "bidi" | "surrogate" | "compatibility" | "combining_mark" | "mixed_script_token";
    span: VoiceEvidenceSpan;
  }>;
}

export interface VoiceVerificationInput {
  rawTranscript: string;
  ownerHash: string;
  language: VoiceLanguage;
  providerConfidence: number | null;
  locale?: "en-AU" | "en-IN" | "hi-IN";
  contacts?: VerifiedVoiceContact[];
  requiredRecipientChannel?: VerifiedVoiceContact["channel"];
  products?: VerifiedVoiceProduct[];
  semantic?: VoiceSemanticEvidence;
}

export interface VoiceVerificationResult {
  schemaVersion: "NITSYCLAW-VOICE-VERIFIER-V1";
  rawTranscript: string;
  normalizedView: string;
  language: VoiceLanguage;
  providerConfidence: number | null;
  unicode: VoiceUnicodeAssessment;
  entities: VoiceTypedEntity[];
  actions: VoiceActionEvidence[];
  negated: boolean;
  correction: "absent" | "present";
  authority: "direct" | "discussion" | "quoted_or_background";
  semanticStatus: VoiceSemanticStatus;
  tier: VoiceRiskTier;
  tierPolicy: VoiceTierPolicy;
  disposition: VoiceVerificationDisposition;
  externalActionAllowed: false;
  reasons: string[];
  policyVersion: "NITSYCLAW-VOICE-VERIFIER-V1";
}
