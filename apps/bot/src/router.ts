// Inbound message router. Owns the fast-path intent detection and dispatch
// to the agent loop.

import type { AgentDeps } from "@nitsyclaw/shared/agent";
import { runAgent } from "@nitsyclaw/shared/agent";
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

const SYSTEM_PROMPT = `You are NitsyClaw, a personal assistant for Nitesh.
You receive WhatsApp messages and must respond by calling tools.
Default behavior: pick exactly one tool that fits, call it, then call \`reply_to_user\` with a short natural confirmation.
Be terse — WhatsApp replies should be at most 4 lines unless asked for detail.
Never invent data. If a tool fails, tell the user plainly.`;

export class Router {
  private registry = registerAllFeatures();

  constructor(private deps: AgentDeps, private ownerPhone: string) {}

  async handle(msg: InboundMessage): Promise<void> {
    if (msg.from !== this.ownerPhone) return; // R2 — only owner

    // Persist inbound (R5: single source of truth).
    const encryptedBody = process.env.ENCRYPTION_KEY ? encryptString(msg.body) : msg.body;
    const persisted = await insertMessage(this.deps.db, {
      direction: "in",
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
        await this.deps.whatsapp.send({ to: msg.from, body: `📝 (Transcribed) ${transcript}` });
      } catch (e) {
        await this.deps.whatsapp.send({ to: msg.from, body: `Couldn't transcribe: ${(e as Error).message}` });
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
        await this.deps.whatsapp.send({
          to: msg.from,
          body: `💸 Logged ${out.currency} ${out.amount} (${out.category}) at ${out.merchant ?? "unknown"}`,
        });
      } catch (e) {
        await this.deps.whatsapp.send({ to: msg.from, body: `Couldn't read receipt: ${(e as Error).message}` });
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
      await this.deps.whatsapp.send({ to: msg.from, body });
      return;
    }

    // 4. Default — agent loop.
    const result = await runAgent({
      userPhone: msg.from,
      userMessage: effectiveText,
      systemPrompt: SYSTEM_PROMPT,
      registry: this.registry,
      deps: this.deps,
    });
    // The agent should have already replied via reply_to_user; only echo if it didn't.
    if (result.toolCalls.every((c) => c.name !== "reply_to_user") && result.finalText.trim()) {
      await this.deps.whatsapp.send({ to: msg.from, body: result.finalText });
    }
  }
}
