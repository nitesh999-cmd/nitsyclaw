import { describe, expect, it, vi } from "vitest";
import type { SpeechSynthesizer } from "@nitsyclaw/shared/agent";
import { saveVoicePreference } from "@nitsyclaw/shared/features";
import type { InboundMessage, OutboundMessage, OutboundSendResult, WhatsAppClient } from "@nitsyclaw/shared/whatsapp";
import { MockWhatsAppClient } from "@nitsyclaw/shared/whatsapp";
import { hashPhone } from "@nitsyclaw/shared/utils";
import { makeFakeDb } from "@nitsyclaw/shared/../test/helpers.js";
import { WhatsAppVoiceReplyClient, updateVoiceTurnTranscript } from "./whatsapp-voice-reply.js";

const OWNER = "+919876543210";

function synthesizer(): SpeechSynthesizer {
  return {
    async synthesize(request) {
      return {
        audio: Buffer.from("OggSsynthetic-opus"),
        mimetype: "audio/ogg; codecs=opus",
        filename: "nitsyclaw-reply.ogg",
        durationSeconds: 2,
        language: request.language,
        engine: "mock-local",
      };
    },
  };
}

function voiceMessage(id: string): InboundMessage {
  return {
    id,
    from: OWNER,
    body: "",
    timestamp: new Date(),
    hasMedia: true,
    mediaType: "voice",
  };
}

function setTranscript(text: string) {
  updateVoiceTurnTranscript({
    text,
    language: text.includes("kal") ? "hinglish" : "english",
    languageConfidence: 0.8,
    providerConfidence: null,
    quality: "medium",
    uncertainSpans: [],
    media: { container: "ogg", codec: "opus", bytes: 10, durationSeconds: 2, channels: 1, sampleRate: 48_000, rmsDb: -20, peak: 0.5 },
    timingsMs: { probe: 1, decode: 1, transcribe: 1, total: 3 },
  });
}

describe("WhatsApp owner voice reply client", () => {
  it("supports voice in and voice out with the local synthesizer", async () => {
    const inner = new MockWhatsAppClient();
    const { db } = makeFakeDb();
    const client = new WhatsAppVoiceReplyClient(inner, { db, ownerNumber: OWNER, speechSynthesizer: synthesizer() });
    client.onMessage(async () => {
      setTranscript("How is my afternoon?");
      await client.send({ to: OWNER, body: "Your afternoon looks calm." });
    });
    await inner.inject(voiceMessage("voice-1"));
    expect(inner.sent).toHaveLength(1);
    expect(inner.sent[0]).toMatchObject({ to: OWNER, body: "", media: { kind: "voice", mimetype: "audio/ogg; codecs=opus" } });
  });

  it("supports voice in and explicit text out", async () => {
    const inner = new MockWhatsAppClient();
    const { db } = makeFakeDb();
    const client = new WhatsAppVoiceReplyClient(inner, { db, ownerNumber: OWNER, speechSynthesizer: synthesizer() });
    client.onMessage(async () => {
      setTranscript("Please reply in text");
      await client.send({ to: OWNER, body: "Text confirmed." });
    });
    await inner.inject(voiceMessage("voice-2"));
    expect(inner.sent).toEqual([expect.objectContaining({ body: "Text confirmed.", deliveryPreference: "text" })]);
  });

  it("supports text in and explicitly requested voice out", async () => {
    const inner = new MockWhatsAppClient();
    const { db } = makeFakeDb();
    const client = new WhatsAppVoiceReplyClient(inner, { db, ownerNumber: OWNER, speechSynthesizer: synthesizer() });
    client.onMessage(async () => client.send({ to: OWNER, body: "Spoken answer." }));
    await inner.inject({ from: OWNER, body: "Please reply by voice", id: "text-voice" });
    expect(inner.sent[0]?.media?.kind).toBe("voice");
  });

  it("uses the persisted owner mode without creating a parallel settings store", async () => {
    const inner = new MockWhatsAppClient();
    const { db } = makeFakeDb();
    await saveVoicePreference(db, { ownerHash: hashPhone(OWNER), key: "mode", value: "voice" });
    const client = new WhatsAppVoiceReplyClient(inner, { db, ownerNumber: OWNER, speechSynthesizer: synthesizer() });
    client.onMessage(async () => client.send({ to: OWNER, body: "Mode persisted." }));
    await inner.inject({ from: OWNER, body: "hello", id: "pref" });
    expect(inner.sent[0]?.media?.kind).toBe("voice");
  });

  it("sends a voice overview plus text details for explicitly voiced structured content", async () => {
    const inner = new MockWhatsAppClient();
    const { db } = makeFakeDb();
    const client = new WhatsAppVoiceReplyClient(inner, { db, ownerNumber: OWNER, speechSynthesizer: synthesizer() });
    client.onMessage(async () => client.send({
      to: OWNER,
      body: "- First item\n- Second item\n- Third item\n- Fourth item\n- Fifth item\n- Sixth item",
    }));
    await inner.inject({ from: OWNER, body: "Reply by voice", id: "structured" });
    expect(inner.sent).toHaveLength(2);
    expect(inner.sent[0]?.media?.kind).toBe("voice");
    expect(inner.sent[1]?.body).toContain("First item");
  });

  it("falls back once to truthful text when synthesis fails before submission", async () => {
    const inner = new MockWhatsAppClient();
    const { db } = makeFakeDb();
    const failed: SpeechSynthesizer = { async synthesize() { throw new Error("model absent"); } };
    const client = new WhatsAppVoiceReplyClient(inner, { db, ownerNumber: OWNER, speechSynthesizer: failed });
    client.onMessage(async () => client.send({ to: OWNER, body: "Original useful answer." }));
    await inner.inject({ from: OWNER, body: "Reply by voice", id: "tts-fail" });
    expect(inner.sent).toHaveLength(1);
    expect(inner.sent[0]?.body).toContain("Original useful answer");
    expect(inner.sent[0]?.body).toContain("No cloud voice service was used");
  });

  it("never sends fallback text after any voice submission error", async () => {
    const inner = new ConcurrentClient();
    inner.sendImpl = async (message) => {
      inner.sent.push(message);
      throw new Error("network may have accepted media");
    };
    const { db } = makeFakeDb();
    const client = new WhatsAppVoiceReplyClient(inner, { db, ownerNumber: OWNER, speechSynthesizer: synthesizer() });
    client.onMessage(async () => client.send({ to: OWNER, body: "Do not duplicate." }));
    await expect(inner.emit({ from: OWNER, body: "Reply by voice", id: "submit-fail" })).rejects.toThrow();
    expect(inner.sent).toHaveLength(1);
    expect(inner.sent[0]?.media?.kind).toBe("voice");
  });

  it("serializes four simultaneous voice turns without cross-correlation", async () => {
    const inner = new ConcurrentClient();
    const { db } = makeFakeDb();
    const client = new WhatsAppVoiceReplyClient(inner, { db, ownerNumber: OWNER, speechSynthesizer: synthesizer() });
    const active: string[] = [];
    let maxActive = 0;
    client.onMessage(async (message) => {
      active.push(message.id);
      maxActive = Math.max(maxActive, active.length);
      setTranscript(`Reply in text for ${message.id}`);
      await new Promise((resolve) => setTimeout(resolve, message.id === "v1" ? 10 : 1));
      await client.send({ to: OWNER, body: `answer:${message.id}` });
      active.pop();
    });
    await Promise.all(["v1", "v2", "v3", "v4"].map((id) => inner.emit(voiceMessage(id))));
    expect(maxActive).toBe(1);
    expect(inner.sent.map((message) => message.body)).toEqual(["answer:v1", "answer:v2", "answer:v3", "answer:v4"]);
  });

  it("preserves real ACK evidence from the exact generated media send", async () => {
    const inner = new ConcurrentClient();
    inner.sendImpl = vi.fn(async (message) => {
      inner.sent.push(message);
      return { id: "real-id", ack: 2, delivery: "device_acknowledged" as const };
    });
    const { db } = makeFakeDb();
    const client = new WhatsAppVoiceReplyClient(inner, { db, ownerNumber: OWNER, speechSynthesizer: synthesizer() });
    let result: OutboundSendResult | undefined;
    client.onMessage(async () => { result = await client.send({ to: OWNER, body: "ACK answer" }); });
    await inner.emit({ from: OWNER, body: "Reply by voice", id: "ack" });
    expect(result).toEqual({ id: "real-id", ack: 2, delivery: "device_acknowledged" });
  });
});

class ConcurrentClient implements WhatsAppClient {
  sent: OutboundMessage[] = [];
  handlers: Array<(message: InboundMessage) => Promise<void> | void> = [];
  sendImpl?: (message: OutboundMessage) => Promise<OutboundSendResult>;

  async ready() {}
  async send(message: OutboundMessage): Promise<OutboundSendResult> {
    if (this.sendImpl) return this.sendImpl(message);
    this.sent.push(message);
    return { id: `id-${this.sent.length}`, ack: 1, delivery: "server_submitted" };
  }
  onMessage(handler: (message: InboundMessage) => Promise<void> | void): void { this.handlers.push(handler); }
  async destroy() { this.handlers = []; }
  async emit(partial: Partial<InboundMessage> & { from: string; body: string; id: string }): Promise<void> {
    const message: InboundMessage = {
      timestamp: new Date(),
      hasMedia: false,
      ...partial,
    };
    await Promise.all(this.handlers.map((handler) => handler(message)));
  }
}
