import type {
  TranscriptionResult,
  TranscriptionQuality,
  VoiceLanguage,
  VoiceMediaFacts,
  VoicePreferences,
  VoiceReplyMode,
} from "./types.js";

const HINGLISH_WORDS = new Set([
  "aaj", "abhi", "acha", "accha", "aur", "bas", "bata", "batao", "bhai",
  "chahiye", "hai", "hain", "ho", "kal", "kar", "karna", "karo", "ka", "ki",
  "ko", "kya", "lekin", "main", "mat", "mein", "mera", "meri", "mujhe", "nahi",
  "namaste", "par", "phir", "raha", "rahe", "se", "subah", "shaam", "tha", "the",
  "tum", "yaad", "liye", "wala", "wali",
]);

const SECRET_PATTERNS = [
  /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|authorization|bearer)\b/i,
  /\bsk-[a-z0-9_-]{12,}\b/i,
  /\b(?:password|secret)\s*[:=]/i,
  /\b[a-z0-9+/]{80,}={0,2}\b/i,
];

export interface LanguageAssessment {
  language: VoiceLanguage;
  confidence: number;
}

export function detectVoiceLanguage(text: string): LanguageAssessment {
  const clean = text.normalize("NFKC").toLowerCase();
  const visible = [...clean].filter((char) => /[\p{L}\p{N}]/u.test(char));
  if (visible.length === 0) return { language: "unknown", confidence: 0 };

  const devanagari = visible.filter((char) => /[\u0900-\u097f]/u.test(char)).length;
  const latin = visible.filter((char) => /[a-z]/u.test(char)).length;
  const words = clean.match(/[a-z]+/g) ?? [];
  const hinglishHits = words.filter((word) => HINGLISH_WORDS.has(word)).length;
  const hindiRatio = devanagari / visible.length;
  const latinRatio = latin / visible.length;

  if (devanagari > 0 && latin > 0) {
    return { language: "mixed", confidence: clamp(0.7 + Math.min(devanagari, latin) / visible.length) };
  }
  if (hindiRatio >= 0.65) return { language: "hindi", confidence: clamp(0.75 + hindiRatio * 0.2) };
  if (latinRatio >= 0.65 && hinglishHits >= 2) {
    return { language: "hinglish", confidence: clamp(0.58 + Math.min(hinglishHits, 6) * 0.06) };
  }
  if (latinRatio >= 0.65) return { language: "english", confidence: clamp(0.7 + latinRatio * 0.2) };
  return { language: "unknown", confidence: 0.35 };
}

export function assessTranscriptionQuality(args: {
  text: string;
  media: VoiceMediaFacts;
  providerConfidence: number | null;
}): { quality: TranscriptionQuality; reasons: string[] } {
  const text = args.text.normalize("NFKC").trim();
  const reasons: string[] = [];
  if (!text) reasons.push("empty_transcript");
  if (args.media.rmsDb < -48 || args.media.peak < 0.01) reasons.push("near_silence");
  if (args.media.durationSeconds > 1 && text.length / args.media.durationSeconds < 0.35) {
    reasons.push("too_little_speech_for_duration");
  }
  if (/(\b\w+\b)(?:\s+\1){5,}/iu.test(text)) reasons.push("repetition_runaway");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) reasons.push("control_characters");
  if (text.length > 12_000) reasons.push("transcript_too_long");
  if (args.providerConfidence !== null && args.providerConfidence < 0.45) reasons.push("provider_low_confidence");

  if (reasons.length > 0) return { quality: "low", reasons };
  if (args.providerConfidence === null) {
    // Handy/transcribe.cpp v0.9.4 does not expose calibrated probabilities.
    // Acoustic and output sanity can support a usable medium assessment, but
    // must never be relabelled as model confidence.
    return { quality: "medium", reasons: ["provider_confidence_unavailable"] };
  }
  if (args.providerConfidence < 0.72) return { quality: "medium", reasons: ["provider_medium_confidence"] };
  return { quality: "high", reasons: [] };
}

export type VoicePreferenceCommand =
  | { kind: "mode"; value: VoiceReplyMode }
  | { kind: "language"; value: VoiceLanguage | "preserve" }
  | { kind: "brief"; value: boolean };

export function parseVoicePreferenceCommand(text: string): VoicePreferenceCommand | null {
  const clean = oneLine(text).toLowerCase().replace(/[.!?]+$/g, "");
  if (/^(?:voice mode on|always reply (?:by|in) voice)$/.test(clean)) return { kind: "mode", value: "voice" };
  if (/^(?:text mode on|always reply (?:by|in) text)$/.test(clean)) return { kind: "mode", value: "text" };
  if (/^(?:automatic mode|auto mode|voice mode automatic)$/.test(clean)) return { kind: "mode", value: "automatic" };
  if (/^(?:speak|reply) (?:more )?briefly$/.test(clean)) return { kind: "brief", value: true };
  if (/^(?:speak|reply) in english$/.test(clean)) return { kind: "language", value: "english" };
  if (/^(?:speak|reply) in hindi$/.test(clean)) return { kind: "language", value: "hindi" };
  if (/^(?:speak|reply) in hinglish$/.test(clean)) return { kind: "language", value: "hinglish" };
  if (/^(?:preserve|use) my language$/.test(clean)) return { kind: "language", value: "preserve" };
  return null;
}

export function explicitVoiceReplyMode(text: string): "text" | "voice" | null {
  const clean = oneLine(text).toLowerCase();
  if (/\b(?:reply|respond|answer|send (?:the )?reply)\s+(?:in|as|by)\s+(?:a\s+)?(?:voice|voice note|audio)\b/.test(clean)) return "voice";
  if (/\b(?:reply|respond|answer|send (?:the )?reply)\s+(?:in|as|by)\s+(?:plain\s+)?text\b/.test(clean)) return "text";
  if (/\b(?:say|speak|read) (?:that|it|the answer) (?:out|aloud)\b/.test(clean)) return "voice";
  return null;
}

export function chooseVoiceReplyDelivery(args: {
  sourceWasVoice: boolean;
  inputText: string;
  replyText: string;
  preferences: VoicePreferences;
  transportPreference?: "text" | "voice" | "auto";
}): "text" | "voice" {
  if (args.transportPreference === "text" || args.transportPreference === "voice") {
    return args.transportPreference;
  }
  const explicit = explicitVoiceReplyMode(args.inputText);
  if (explicit) return explicit;
  if (args.preferences.mode !== "automatic") return args.preferences.mode;
  if (!args.sourceWasVoice) return "text";
  return isStructuredForSpeech(args.replyText) ? "text" : "voice";
}

export function isStructuredForSpeech(text: string): boolean {
  const clean = text.trim();
  if (clean.length > 700) return true;
  if (/```|https?:\/\/|\|\s*[-:]{3,}\s*\||^\s*[-*]\s+/m.test(clean)) return true;
  const nonEmptyLines = clean.split(/\r?\n/).filter((line) => line.trim());
  return nonEmptyLines.length >= 6;
}

export function containsUnsafeSpokenMaterial(text: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

export function normalizeTextForSpeech(text: string, opts: { brief?: boolean } = {}): string {
  if (containsUnsafeSpokenMaterial(text)) {
    throw new Error("voice output blocked because the reply may contain sensitive material");
  }
  let clean = text.normalize("NFKC")
    .replace(/```[\s\S]*?```/g, " Code is included in the text reply. ")
    .replace(/https?:\/\/\S+/g, " link included in the text reply ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\|/g, ", ")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const limit = opts.brief ? 420 : 1_200;
  if (clean.length > limit) {
    const clipped = clean.slice(0, limit);
    const boundary = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("? "), clipped.lastIndexOf("! "));
    clean = `${(boundary > 120 ? clipped.slice(0, boundary + 1) : clipped).trim()} Full details are in the text reply.`;
  }
  if (!clean) throw new Error("voice output is empty after speech normalization");
  return clean;
}

export function voiceAuthorityNeedsClarification(text: string): boolean {
  const clean = oneLine(text).toLowerCase();
  const quotedOrBackground = /\b(?:the tv|television|radio|podcast|video|someone|they|he|she)\s+(?:said|says|is saying)|\b(?:quote|quoted|reading aloud)\b/.test(clean);
  const actionable = /\b(?:send|delete|buy|pay|book|call|email|message|transfer|post|publish|schedule|remind)\b/.test(clean);
  return quotedOrBackground && actionable;
}

/** Compatibility boundary for existing injected test/legacy adapters. */
export function coerceTranscriptionResult(
  value: unknown,
  args: { mimetype: string; bytes: number },
): TranscriptionResult {
  if (value && typeof value === "object" && typeof (value as { text?: unknown }).text === "string") {
    return value as TranscriptionResult;
  }
  const text = typeof value === "string" ? value : "";
  const language = detectVoiceLanguage(text);
  const mime = args.mimetype.toLowerCase();
  const container = mime.includes("webm") ? "webm" : mime.includes("mp4") || mime.includes("m4a")
    ? "mp4" : mime.includes("mpeg") || mime.includes("mp3") ? "mp3" : mime.includes("wav") ? "wav" : "ogg";
  const codec = container === "ogg" || container === "webm" ? "opus" : container === "mp4" ? "aac" : container === "mp3" ? "mp3" : "pcm";
  return {
    text,
    language: language.language,
    languageConfidence: language.confidence,
    providerConfidence: null,
    quality: text.trim() ? "medium" : "low",
    uncertainSpans: [],
    media: {
      container,
      codec,
      bytes: args.bytes,
      durationSeconds: 0,
      channels: 1,
      sampleRate: 16_000,
      rmsDb: 0,
      peak: 0,
    },
    timingsMs: { probe: 0, decode: 0, transcribe: 0, total: 0 },
  };
}

function oneLine(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
