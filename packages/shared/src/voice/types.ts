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
