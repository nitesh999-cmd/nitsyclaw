import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import type { AgentDeps, SpeechSynthesizer } from "@nitsyclaw/shared/agent";
import { getVoicePreferences } from "@nitsyclaw/shared/features";
import { mergeVoiceMessageMetadata } from "@nitsyclaw/shared/db";
import type {
  InboundMessage,
  OutboundMessage,
  OutboundSendResult,
  WhatsAppClient,
} from "@nitsyclaw/shared/whatsapp";
import {
  chooseVoiceReplyDelivery,
  detectVoiceLanguage,
  isStructuredForSpeech,
  normalizeTextForSpeech,
  type SpeechSynthesisResult,
  type TranscriptionResult,
  type VoiceLanguage,
} from "@nitsyclaw/shared/voice";
import { hashPhone } from "@nitsyclaw/shared/utils";
import { logBotError } from "./safe-log.js";

interface VoiceTurnContext {
  sourceWasVoice: boolean;
  inputText: string;
  language: VoiceLanguage;
  sourceMessageDbId?: string;
  forceText: boolean;
}

const voiceTurnStorage = new AsyncLocalStorage<VoiceTurnContext>();

export function updateVoiceTurnTranscript(result: TranscriptionResult): void {
  const turn = voiceTurnStorage.getStore();
  if (!turn) return;
  turn.inputText = result.text;
  turn.language = result.language;
}

export function bindVoiceTurnMessage(messageId: string): void {
  const turn = voiceTurnStorage.getStore();
  if (turn) turn.sourceMessageDbId = messageId;
}

export function forceVoiceTurnText(force = true): void {
  const turn = voiceTurnStorage.getStore();
  if (turn) turn.forceText = force;
}

export interface WhatsAppVoiceReplyClientOptions {
  db: AgentDeps["db"];
  ownerNumber: string;
  speechSynthesizer?: SpeechSynthesizer;
  maxQueuedTurns?: number;
}

/**
 * Serializes owner turns and applies reply-mode policy at the transport seam.
 * This also covers the reply_to_user tool, which otherwise bypasses Router
 * reply helpers. AsyncLocalStorage keeps four rapid turns from cross-routing.
 */
export class WhatsAppVoiceReplyClient implements WhatsAppClient {
  private queueTail: Promise<void> = Promise.resolve();
  private queuedTurns = 0;
  private readonly maxQueuedTurns: number;

  constructor(
    private readonly inner: WhatsAppClient,
    private readonly options: WhatsAppVoiceReplyClientOptions,
  ) {
    this.maxQueuedTurns = options.maxQueuedTurns ?? 8;
  }

  ready(): Promise<void> {
    return this.inner.ready();
  }

  async send(message: OutboundMessage): Promise<OutboundSendResult> {
    if (message.media) return this.inner.send(message);
    const turn = voiceTurnStorage.getStore();
    if (!turn || turn.forceText) return this.sendText(message, turn);

    const preferences = await getVoicePreferences(this.options.db, hashPhone(this.options.ownerNumber)).catch(() => ({
      mode: "text" as const,
      language: "preserve" as const,
      brief: false,
    }));
    const delivery = chooseVoiceReplyDelivery({
      sourceWasVoice: turn.sourceWasVoice,
      inputText: turn.inputText,
      replyText: message.body,
      preferences,
      transportPreference: message.deliveryPreference,
    });
    if (delivery === "text") return this.sendText(message, turn);

    const language = preferences.language === "preserve"
      ? (turn.language === "unknown" ? detectVoiceLanguage(message.body).language : turn.language)
      : preferences.language;
    const structured = isStructuredForSpeech(message.body);
    let generated: SpeechSynthesisResult;
    try {
      if (!this.options.speechSynthesizer) throw new Error("local speech synthesizer unavailable");
      const speechText = normalizeTextForSpeech(message.body, { brief: preferences.brief || structured });
      generated = await this.options.speechSynthesizer.synthesize({
        text: speechText,
        language,
        correlationId: turn.sourceMessageDbId ? opaqueId(turn.sourceMessageDbId) : undefined,
      });
    } catch {
      // Only synthesis/normalization failures reach this fallback. WhatsApp
      // submission is deliberately outside this catch because any send error
      // may still represent a phone-visible voice note.
      const fallback = `${message.body.trim()}\n\nVoice reply is unavailable locally for this language or engine state. No cloud voice service was used.`;
      await this.recordDelivery(turn, { status: "tts_unavailable", responseMode: "text" });
      return this.inner.send({ ...message, body: fallback, deliveryPreference: "text" });
    }
    const voiceResult = await this.inner.send({
      to: message.to,
      body: "",
      quotedMessageId: message.quotedMessageId,
      media: {
        data: generated.audio,
        mimetype: generated.mimetype,
        filename: generated.filename,
        kind: "voice",
      },
      deliveryPreference: "voice",
    });
    await this.recordDelivery(turn, {
      status: "done",
      responseMode: "voice",
      generatedDurationMs: Math.round(generated.durationSeconds * 1_000),
      outputIdHash: opaqueId(voiceResult.id),
      ack: voiceResult.ack,
      delivery: voiceResult.delivery,
    });
    if (structured) {
      // Voice has genuine submission evidence before the secondary detail
      // text is attempted. Failure of that best-effort detail send must not
      // trigger a duplicate voice retry.
      await this.inner.send({ ...message, deliveryPreference: "text" }).catch((error) => {
        logBotError("[voice-reply] detail text failed after acknowledged voice", error);
      });
    }
    return voiceResult;
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void> | void): void {
    this.inner.onMessage((message) => {
      if (this.queuedTurns >= this.maxQueuedTurns) {
        throw new Error("Owner turn queue is full; inbound processing failed closed.");
      }
      this.queuedTurns += 1;
      const run = this.queueTail.then(async () => {
        const language = detectVoiceLanguage(message.body).language;
        await voiceTurnStorage.run({
          sourceWasVoice: message.mediaType === "voice",
          inputText: message.body,
          language,
          forceText: false,
        }, async () => handler(message));
      });
      this.queueTail = run.then(() => undefined, () => undefined);
      return run.finally(() => {
        this.queuedTurns -= 1;
      });
    });
  }

  destroy(): Promise<void> {
    return this.inner.destroy();
  }

  private async sendText(message: OutboundMessage, turn?: VoiceTurnContext): Promise<OutboundSendResult> {
    const result = await this.inner.send({ ...message, deliveryPreference: "text" });
    if (turn?.sourceWasVoice && message.finalResponse !== false) {
      await this.recordDelivery(turn, {
        status: "done",
        responseMode: "text",
        outputIdHash: opaqueId(result.id),
        ack: result.ack,
        delivery: result.delivery,
      });
    }
    return result;
  }

  private async recordDelivery(turn: VoiceTurnContext, patch: Record<string, unknown>): Promise<void> {
    if (!turn.sourceMessageDbId) return;
    await mergeVoiceMessageMetadata(this.options.db, turn.sourceMessageDbId, {
      ...patch,
      updatedAt: new Date().toISOString(),
    }).catch((error) => logBotError("[voice-reply] metadata update failed", error));
  }
}

function looksLikeWhatsAppSubmissionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "WhatsAppOutboundSubmissionError" || /acknowledg|submission|message id|recipient/i.test(error.message);
}

function opaqueId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export const whatsappVoiceReplyInternals = { opaqueId, looksLikeWhatsAppSubmissionError };
