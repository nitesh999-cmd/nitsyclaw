// Inbound message router. Owns the fast-path intent detection and dispatch
// to the agent loop.

import type { AgentDeps } from "@nitsyclaw/shared/agent";
import { runAgent, buildSystemPrompt, loadCrossSurfaceHistory } from "@nitsyclaw/shared/agent";
import { detectIntent } from "@nitsyclaw/shared/utils";
import {
  resolveConfirmation,
  registerAllFeatures,
  transcribeAndStore,
  processReceiptImage,
} from "@nitsyclaw/shared/features";
import type { InboundMessage } from "@nitsyclaw/shared/whatsapp";
import { insertMessage } from "@nitsyclaw/shared/db";
import { encryptString, hashPhone, maskPhone } from "@nitsyclaw/shared/utils";

const SYSTEM_PROMPT = buildSystemPrompt({ surface: "whatsapp" });

export class Router {
  private registry = registerAllFeatures();

  constructor(private deps: AgentDeps, private ownerPhone: string) {}

  /** Send a WhatsApp message AND persist it (direction='out', surface='whatsapp'). */
  private async sendAndPersist(body: string): Promise<void> {
    await this.deps.whatsapp.send({ to: this.ownerPhone, body });
    try {
      const enc = process.env.ENCRYPTION_KEY ? encryptString(body) : body;
      await insertMessage(this.deps.db, {
        direction: "out",
        surface: "whatsapp",
        fromNumber: hashPhone(this.ownerPhone),
        body: enc,
      });
    } catch (e) {
      console.error("[router] failed to persist outbound", e);
    }
  }

  async handle(msg: InboundMessage): Promise<void> {
    if (msg.from !== this.ownerPhone) return; // R2 — only owner

    // Load cross-surface history BEFORE persisting current turn so it isn't included.
    const history = await loadCrossSurfaceHistory(
      this.deps.db,
      hashPhone(this.ownerPhone),
      20,
    ).catch((e) => {
      console.error("[router] history load failed", e);
      return [];
    });

    // Persist inbound (R5: single source of truth).
    const encryptedBody = process.env.ENCRYPTION_KEY ? encryptString(msg.body) : msg.body;
    const persisted = await insertMessage(this.deps.db, {
      direction: "in",
      surface: "whatsapp",
      waMessageId: msg.id,
      fromNumber: hashPhone(msg.from),
      body: encryptedBody,
      mediaType: msg.mediaType ?? null,
      metadata: { masked: maskPhone(msg.from) },
    });

    // 1. Voice note → transcribe → continue as if it were text.
    let effectiveText = msg.body;
    if (msg.mediaType === "voice" && msg.downloadMedia) {
      try {
        const media = await msg.downloadMedia();
        const { transcript } = await transcribeAndStore({
          audio: media.data,
          mimetype: media.mimetype,
          transcriber: this.deps.transcriber,
          db: this.deps.db,
          sourceMessageId: persisted.id,
        });
        effectiveText = transcript;
        await this.sendAndPersist(`📝 (Transcribed) ${transcript}`);
      } catch (e) {
        await this.sendAndPersist(`Couldn't transcribe: ${(e as Error).message}`);
        return;
      }
    }

    // 2. Receipt image → process directly without LLM dispatch.
    if (msg.mediaType === "image" && msg.downloadMedia) {
      try {
        const media = await msg.downloadMedia();
        const out = await processReceiptImage({
          image: media.data,
          mimetype: media.mimetype,
          analyzer: this.deps.imageAnalyzer,
          db: this.deps.db,
          now: this.deps.now(),
          sourceMessageId: persisted.id,
        });
        await this.sendAndPersist(
          `💸 Logged ${out.currency} ${out.amount} (${out.category}) at ${out.merchant ?? "unknown"}`,
        );
      } catch (e) {
        await this.sendAndPersist(`Couldn't read receipt: ${(e as Error).message}`);
      }
      return;
    }

    // 3. Confirmation y/n short-circuit (no LLM needed).
    const intent = detectIntent(effectiveText);
    if (intent === "confirmation") {
      const out = await resolveConfirmation({
        db: this.deps.db,
        reply: effectiveText,
        now: this.deps.now(),
      });
      const body = out
        ? `Confirmation ${out.id}: ${out.decision}`
        : "No pending confirmations.";
      await this.sendAndPersist(body);
      return;
    }

    // 4. Default — agent loop with cross-surface history.
    const result = await runAgent({
      userPhone: msg.from,
      userMessage: effectiveText,
      history,
      systemPrompt: SYSTEM_PROMPT,
      registry: this.registry,
      deps: this.deps,
    });
    // The agent should have already replied via reply_to_user; only echo if it didn't.
    const replyToUserCall = result.toolCalls.find((c) => c.name === "reply_to_user" && c.success);
    if (replyToUserCall) {
      // The tool already sent via WhatsApp; persist the reply for cross-surface history.
      const text = (replyToUserCall.input as { text?: string })?.text ?? "";
      if (text.trim()) {
        try {
          const enc = process.env.ENCRYPTION_KEY ? encryptString(text) : text;
          await insertMessage(this.deps.db, {
            direction: "out",
            surface: "whatsapp",
            fromNumber: hashPhone(this.ownerPhone),
            body: enc,
          });
        } catch (e) {
          console.error("[router] failed to persist reply_to_user outbound", e);
        }
      }
    } else if (result.finalText.trim()) {
      await this.sendAndPersist(result.finalText);
    }
  }
}
