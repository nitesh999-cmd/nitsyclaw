// Concrete WhatsAppClient backed by whatsapp-web.js.
// This is the ONLY file that imports whatsapp-web.js (Constitution R16).

import wweb from "whatsapp-web.js";
const { Client, LocalAuth } = wweb;
type Message = wweb.Message;

import qrcode from "qrcode-terminal";
import type {
  InboundMessage,
  OutboundMessage,
  WhatsAppClient,
} from "@nitsyclaw/shared/whatsapp";
import { isOwnerSelfChat, normalizeWhatsAppOwnerId } from "./whatsapp-identity.js";

const PUPPETEER_ARGS = process.platform === "win32"
  ? ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  : ["--no-sandbox", "--disable-setuid-sandbox", "--single-process", "--no-zygote", "--disable-dev-shm-usage"];

export interface WwebjsOptions {
  sessionDir: string;
  ownerNumber: string;
  onlyOwner?: boolean;
}

export class WwebjsClient implements WhatsAppClient {
  private recentOutgoingBodies: Array<{ body: string; sentAt: number }> = [];
  private client: Client;
  private handlers: Array<(m: InboundMessage) => Promise<void> | void> = [];
  private readyPromise: Promise<void>;
  private readyResolve!: () => void;

  constructor(private opts: WwebjsOptions) {
    this.readyPromise = new Promise((res) => { this.readyResolve = res; });

    const puppeteerOpts: Record<string, unknown> = {
      headless: true,
      args: PUPPETEER_ARGS,
      handleSIGINT: false,
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      puppeteerOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: opts.sessionDir }),
      puppeteer: puppeteerOpts as never,
      webVersionCache: {
        type: "remote",
        remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1023223821.html",
      },
    });
    this.wireEvents();
    this.client.initialize();
  }

  private isOurEcho(body: string): boolean {
    const now = Date.now();
    this.recentOutgoingBodies = this.recentOutgoingBodies.filter(e => now - e.sentAt < 60_000);
    const idx = this.recentOutgoingBodies.findIndex(e => e.body === body);
    if (idx >= 0) {
      this.recentOutgoingBodies.splice(idx, 1);
      return true;
    }
    return false;
  }

  private wireEvents(): void {
    this.client.on("qr", (qr) => {
      console.log("[wwebjs] QR code received - scan with your phone");
      qrcode.generate(qr, { small: true });
      const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=" + encodeURIComponent(qr);
      console.log("[wwebjs] QR also available at: " + qrUrl);
    });
    this.client.on("ready", () => {
      console.log("[wwebjs] client ready");
      this.readyResolve();
    });
    this.client.on("auth_failure", (err) => console.error("[wwebjs] auth_failure", err));
    this.client.on("disconnected", (reason) => console.error("[wwebjs] disconnected", reason));

    const handleMessage = async (m: Message) => {
      try {
        const body = m.body ?? "";
        const fromMe = (m as any).fromMe;

        if (fromMe && this.isOurEcho(body)) return;

        // SELF-CHAT ONLY: NitsyClaw must only respond to messages in YOUR self-chat,
        // not when you're typing in conversations with other contacts.
        const fromRaw = (m as any).from ?? "";
        const from = normalizeWhatsAppOwnerId(fromRaw);
        const toRaw = (m as any).to ?? "";
        const to = normalizeWhatsAppOwnerId(toRaw);
        if (
          !isOwnerSelfChat({
            from: fromRaw,
            fromMe,
            to: toRaw,
            ownerNumber: this.opts.ownerNumber,
          })
        ) {
          console.log(`[wwebjs] dropped: not self-chat (from=${from} to=${to})`);
          return;
        }

        console.log(`[wwebjs] inbound: from=${from} fromMe=${fromMe} body="${body.slice(0, 50)}"`);

        if (
          this.opts.onlyOwner !== false &&
          from !== normalizeWhatsAppOwnerId(this.opts.ownerNumber)
        ) {
          console.log(`[wwebjs] dropped: from=${from} != owner=${this.opts.ownerNumber}`);
          return;
        }

        const inbound: InboundMessage = {
          id: m.id?._serialized ?? "",
          from: this.opts.ownerNumber,
          body,
          timestamp: new Date((m.timestamp ?? Date.now() / 1000) * 1000),
          hasMedia: m.hasMedia,
          mediaType: m.hasMedia
            ? (m.type === "ptt" || m.type === "audio")
              ? "voice"
              : m.type === "image"
                ? "image"
                : "document"
            : undefined,
          downloadMedia: m.hasMedia
            ? async () => {
                const media = await m.downloadMedia();
                return {
                  data: Buffer.from(media.data, "base64"),
                  mimetype: media.mimetype,
                  filename: media.filename ?? undefined,
                };
              }
            : undefined,
        };
        for (const h of this.handlers) await h(inbound);
      } catch (e) {
        console.error("[wwebjs] handler error", e);
      }
    };

    this.client.on("message", handleMessage);
    this.client.on("message_create", handleMessage);
  }

  async ready(): Promise<void> {
    return this.readyPromise;
  }

  async send(msg: OutboundMessage): Promise<{ id: string }> {
    this.recentOutgoingBodies.push({ body: msg.body, sentAt: Date.now() });
    const target = msg.to.includes("@") ? msg.to : `${msg.to}@c.us`;
    const sent = await this.client.sendMessage(target, msg.body);
    return { id: sent.id?._serialized ?? "" };
  }

  onMessage(handler: (m: InboundMessage) => Promise<void> | void): void {
    this.handlers.push(handler);
  }

  async destroy(): Promise<void> {
    await this.client.destroy();
  }
}
