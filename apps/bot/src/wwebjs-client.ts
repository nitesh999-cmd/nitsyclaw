// Concrete WhatsAppClient backed by whatsapp-web.js.
// This is the ONLY file that imports whatsapp-web.js (Constitution R16).

import wweb from "whatsapp-web.js";
const { Client, LocalAuth } = wweb;
type WwebjsClientInstance = InstanceType<typeof Client>;
type Message = wweb.Message;

import qrcode from "qrcode-terminal";
import type {
  InboundMessage,
  OutboundMessage,
  WhatsAppClient,
} from "@nitsyclaw/shared/whatsapp";
import {
  isHealthyWhatsAppState,
  shouldRestartWhatsAppClient,
  withTimeout,
} from "./whatsapp-health.js";
import { isOwnerSelfChat, normalizeWhatsAppOwnerId } from "./whatsapp-identity.js";

const PUPPETEER_ARGS = process.platform === "win32"
  ? ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  : ["--no-sandbox", "--disable-setuid-sandbox", "--single-process", "--no-zygote", "--disable-dev-shm-usage"];

export interface WwebjsOptions {
  sessionDir: string;
  ownerNumber: string;
  onlyOwner?: boolean;
  healthProbeIntervalMs?: number;
  healthProbeTimeoutMs?: number;
  maxConsecutiveHealthFailures?: number;
}

export class WwebjsClient implements WhatsAppClient {
  private recentOutgoingBodies: Array<{ body: string; sentAt: number }> = [];
  private client: WwebjsClientInstance;
  private handlers: Array<(m: InboundMessage) => Promise<void> | void> = [];
  private readyPromise: Promise<void>;
  private readyResolve!: () => void;
  private healthProbe?: NodeJS.Timeout;
  private restarting?: Promise<void>;
  private stopped = false;
  private generation = 0;
  private consecutiveHealthFailures = 0;
  private readonly healthProbeIntervalMs: number;
  private readonly healthProbeTimeoutMs: number;
  private readonly maxConsecutiveHealthFailures: number;
  private readonly puppeteerOpts: Record<string, unknown>;

  constructor(private opts: WwebjsOptions) {
    this.healthProbeIntervalMs = opts.healthProbeIntervalMs ?? 60_000;
    this.healthProbeTimeoutMs = opts.healthProbeTimeoutMs ?? 15_000;
    this.maxConsecutiveHealthFailures = opts.maxConsecutiveHealthFailures ?? 2;
    this.readyPromise = this.newReadyPromise();

    this.puppeteerOpts = {
      headless: true,
      args: PUPPETEER_ARGS,
      handleSIGINT: false,
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      this.puppeteerOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    this.client = this.createClient();
    this.wireEvents(this.generation);
    void this.client.initialize();
  }

  private newReadyPromise(): Promise<void> {
    return new Promise((res) => { this.readyResolve = res; });
  }

  private createClient(): WwebjsClientInstance {
    return new Client({
      authStrategy: new LocalAuth({ dataPath: this.opts.sessionDir }),
      puppeteer: this.puppeteerOpts as never,
      webVersionCache: {
        type: "remote",
        remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1023223821.html",
      },
    });
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

  private startHealthProbe(): void {
    if (this.healthProbeIntervalMs <= 0) return;
    if (this.healthProbe) clearInterval(this.healthProbe);
    this.healthProbe = setInterval(() => void this.probeHealth(), this.healthProbeIntervalMs);
    this.healthProbe.unref?.();
  }

  private async probeHealth(): Promise<void> {
    if (this.stopped || this.restarting) return;
    try {
      const state = await withTimeout(
        this.client.getState(),
        this.healthProbeTimeoutMs,
        "WhatsApp getState",
      );
      if (!isHealthyWhatsAppState(String(state))) {
        throw new Error(`state=${state ?? "unknown"}`);
      }
      await withTimeout(
        this.client.sendPresenceAvailable(),
        this.healthProbeTimeoutMs,
        "WhatsApp presence probe",
      );
      this.consecutiveHealthFailures = 0;
    } catch (e) {
      this.consecutiveHealthFailures += 1;
      console.error(
        `[wwebjs] health probe failed (${this.consecutiveHealthFailures}/${this.maxConsecutiveHealthFailures})`,
        e,
      );
      if (
        shouldRestartWhatsAppClient(
          this.consecutiveHealthFailures,
          this.maxConsecutiveHealthFailures,
        )
      ) {
        await this.restart(`health probe failed: ${String(e)}`);
      }
    }
  }

  private async restart(reason: string): Promise<void> {
    if (this.stopped) return;
    if (this.restarting) return this.restarting;

    this.restarting = (async () => {
      console.error(`[wwebjs] restarting client: ${reason}`);
      if (this.healthProbe) {
        clearInterval(this.healthProbe);
        this.healthProbe = undefined;
      }

      const oldClient = this.client;
      oldClient.removeAllListeners();
      await oldClient.destroy().catch((e: unknown) => {
        console.error("[wwebjs] destroy during restart failed", e);
      });

      this.generation += 1;
      this.readyPromise = this.newReadyPromise();
      this.client = this.createClient();
      this.wireEvents(this.generation);
      await this.client.initialize();
    })().finally(() => {
      this.consecutiveHealthFailures = 0;
      this.restarting = undefined;
    });

    return this.restarting;
  }

  private wireEvents(generation: number): void {
    const isCurrentGeneration = () => generation === this.generation && !this.stopped;

    this.client.on("qr", (qr: string) => {
      if (!isCurrentGeneration()) return;
      console.log("[wwebjs] QR code received - scan with your phone");
      qrcode.generate(qr, { small: true });
      const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=" + encodeURIComponent(qr);
      console.log("[wwebjs] QR also available at: " + qrUrl);
    });
    this.client.on("ready", () => {
      if (!isCurrentGeneration()) return;
      console.log("[wwebjs] client ready");
      this.consecutiveHealthFailures = 0;
      this.readyResolve();
      this.startHealthProbe();
    });
    this.client.on("change_state", (state: unknown) => {
      if (!isCurrentGeneration()) return;
      console.log("[wwebjs] state", state);
    });
    this.client.on("auth_failure", (err: unknown) => {
      if (!isCurrentGeneration()) return;
      console.error("[wwebjs] auth_failure", err);
      void this.restart(`auth_failure: ${String(err)}`);
    });
    this.client.on("disconnected", (reason: unknown) => {
      if (!isCurrentGeneration()) return;
      console.error("[wwebjs] disconnected", reason);
      void this.restart(`disconnected: ${String(reason)}`);
    });

    const handleMessage = async (m: Message) => {
      if (!isCurrentGeneration()) return;
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
    await this.ready();
    try {
      const sent = await this.client.sendMessage(target, msg.body);
      return { id: sent.id?._serialized ?? "" };
    } catch (e) {
      void this.restart(`send failed: ${String(e)}`);
      throw e;
    }
  }

  onMessage(handler: (m: InboundMessage) => Promise<void> | void): void {
    this.handlers.push(handler);
  }

  async destroy(): Promise<void> {
    this.stopped = true;
    if (this.healthProbe) clearInterval(this.healthProbe);
    this.client.removeAllListeners();
    await this.client.destroy();
  }
}
