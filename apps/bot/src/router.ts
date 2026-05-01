// Inbound message router. Owns the fast-path intent detection and dispatch
// to the agent loop.

import type { AgentDeps } from "@nitsyclaw/shared/agent";
import { runAgent, buildSystemPrompt, loadCrossSurfaceHistory } from "@nitsyclaw/shared/agent";
import { detectIntent } from "@nitsyclaw/shared/utils";
import {
  registerAllFeatures,
  transcribeAndStore,
  processReceiptImage,
} from "@nitsyclaw/shared/features";
import type { InboundMessage } from "@nitsyclaw/shared/whatsapp";
import { insertMessage, insertFeatureRequest } from "@nitsyclaw/shared/db";
import { encryptString, hashPhone, maskPhone } from "@nitsyclaw/shared/utils";
import { pushNotify } from "@nitsyclaw/shared/notify";

const SYSTEM_PROMPT = buildSystemPrompt({ surface: "whatsapp" });

export class Router {
  private registry = registerAllFeatures({ surface: "whatsapp" });

  constructor(private deps: AgentDeps, private ownerPhone: string) {}

  /** Identify a non-receipt image via the LLM. Short prompt, low max-tokens,
   *  one-line output. Returns "an image of X" style description. */
  private async identifyImage(image: Buffer, mimetype: string): Promise<string> {
    try {
      // Reuse the imageAnalyzer's underlying client by issuing a non-receipt
      // prompt. We do this through llm.complete with an image content block
      // since extractReceipt is receipt-specific. Fall back to imageAnalyzer
      // raw text if available.
      const out = await this.deps.imageAnalyzer.extractReceipt(image, mimetype);
      const raw = out.rawText?.trim();
      if (raw && raw.length > 5) {
        // The vision call already happened; raw text often contains a
        // generic description even if structured fields are missing.
        return raw.slice(0, 280);
      }
    } catch {
      // ignore; fall through
    }
    return "an image (couldn't auto-classify)";
  }

  /** Send a WhatsApp message, persist it (direction='out', surface='whatsapp'),
   *  and fire a push notification (ntfy + optional Windows toast) so Nitesh
   *  isn't relying on WhatsApp's own self-chat notifications (which often
   *  silently fail). All three are best-effort; failure of any one doesn't
   *  block the others. */
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
    pushNotify(body, { title: "NitsyClaw replied", priority: "default" }).catch(() => {});
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
        await this.sendAndPersist(
          `📝 Transcribed. I will reply in English.\n${transcript}`,
        );
      } catch (e) {
        await this.sendAndPersist(`Couldn't transcribe: ${(e as Error).message}`);
        return;
      }
    }

    // 2. Image → try receipt first; if extraction yields no amount, fall back
    //    to general image identification (feature_request fr_29956dc5).
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
        if (out && out.amount && out.amount > 0) {
          await this.sendAndPersist(
            `💸 Logged ${out.currency} ${out.amount} (${out.category}) at ${out.merchant ?? "unknown"}`,
          );
          return;
        }
        // Receipt extraction returned nothing useful — treat as general image.
        const description = await this.identifyImage(media.data, media.mimetype);
        await this.sendAndPersist(
          `📸 I see: ${description}\n\nWhat would you like to do? Reply with: "save as memory", "set a reminder about this", "log expense ${out?.rawText ? `(${out.rawText})` : ""}", or just describe what you want.`,
        );
      } catch (e) {
        // Even receipt parsing crashed (vision API failure, etc.). Try general path.
        try {
          const media = await msg.downloadMedia();
          const description = await this.identifyImage(media.data, media.mimetype);
          await this.sendAndPersist(
            `📸 I see: ${description}\n\nWhat would you like to do? Reply with: "save as memory", "set a reminder", or describe what you want.`,
          );
        } catch (e2) {
          await this.sendAndPersist(`Couldn't read that image: ${(e2 as Error).message}`);
        }
      }
      return;
    }

    // 2.5 — `/addfeature <description>` shortcut (feature_request fr_96407890).
    //      Fast path for power users: skip the agent loop, persist directly.
    const addFeatureMatch = effectiveText.trim().match(/^\/addfeature\s+(.+)$/is);
    if (addFeatureMatch) {
      const description = addFeatureMatch[1]?.trim() ?? "";
      if (description.length < 5) {
        await this.sendAndPersist(
          `That description is too short. Try: /addfeature voice input on dashboard /chat using Web Speech API`,
        );
        return;
      }
      try {
        const row = await insertFeatureRequest(this.deps.db, {
          description,
          size: "M",
          source: "whatsapp",
          requestedBy: hashPhone(this.ownerPhone),
        });
        await this.sendAndPersist(
          `✅ Queued! ID: ${row.id.slice(0, 8)}. Build agent picks it up at next run.`,
        );
      } catch (e) {
        await this.sendAndPersist(`Couldn't queue: ${(e as Error).message}`);
      }
      return;
    }

    // 3. Confirmation y/n short-circuit (no LLM needed).
    const intent = detectIntent(effectiveText);
    if (intent === "confirmation") {
      const confirmationTool = this.registry.get("resolve_confirmation");
      const reply = /^(y|yes|approve|confirm|ok|okay)\b/i.test(effectiveText.trim())
        ? "yes"
        : "no";
      const out = confirmationTool
        ? await confirmationTool.handler(
            { reply },
            {
              userPhone: msg.from,
              now: this.deps.now(),
              timezone: this.deps.timezone,
              deps: this.deps,
            },
          )
        : null;
      if (out && (out as { resolved?: boolean }).resolved) {
        const resolved = out as {
          decision?: string;
          action?: string;
          playlist?: { name?: string; url?: string; added?: number };
          link?: string;
        };
        if (resolved.playlist) {
          await this.sendAndPersist(
            `Done. Created Spotify playlist "${resolved.playlist.name ?? "playlist"}" with ${resolved.playlist.added ?? 0} tracks.\n${resolved.playlist.url ?? ""}`.trim(),
          );
        } else if (resolved.link) {
          await this.sendAndPersist(`Confirmation: ${resolved.decision}\n${resolved.link}`);
        } else {
          await this.sendAndPersist(`Confirmation: ${resolved.decision ?? "resolved"}`);
        }
        return;
      }
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
        pushNotify(text, { title: "NitsyClaw replied", priority: "default" }).catch(() => {});
      }
    } else if (result.finalText.trim()) {
      await this.sendAndPersist(result.finalText);
    }
  }
}
