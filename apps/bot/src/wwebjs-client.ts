// Concrete WhatsAppClient backed by whatsapp-web.js.
// This is the ONLY file that imports whatsapp-web.js (Constitution R16).

import wweb from "whatsapp-web.js";
const { Client, LocalAuth } = wweb;
type WwebjsClientInstance = InstanceType<typeof Client>;
type Message = wweb.Message;

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
import { markPresenceUnavailable } from "./whatsapp-presence.js";

const PUPPETEER_ARGS = process.platform === "win32"
  ? ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  : ["--no-sandbox", "--disable-setuid-sandbox", "--single-process", "--no-zygote", "--disable-dev-shm-usage"];

function defaultHealthFilePath(): string {
  const cwd = process.cwd();
  if (cwd.replaceAll("\\", "/").endsWith("/apps/bot")) {
    return resolve(cwd, "../../logs/whatsapp-health-last-ok.txt");
  }
  return resolve(cwd, "logs/whatsapp-health-last-ok.txt");
}

export interface WwebjsOptions {
  sessionDir: string;
  ownerNumber: string;
  onlyOwner?: boolean;
  healthProbeIntervalMs?: number;
  healthProbeTimeoutMs?: number;
  initializeTimeoutMs?: number;
  restartBackoffMs?: number;
  maxConsecutiveHealthFailures?: number;
  healthFilePath?: string;
}

export class WwebjsClient implements WhatsAppClient {
  private recentOutgoingBodies: Array<{ body: string; sentAt: number }> = [];
  private client: WwebjsClientInstance;
  private handlers: Array<(m: InboundMessage) => Promise<void> | void> = [];
  private readyPromise: Promise<void>;
  private readyResolve!: () => void;
  private healthProbe?: NodeJS.Timeout;
  private readyWatchdog?: NodeJS.Timeout;
  private restarting?: Promise<void>;
  private stopped = false;
  private generation = 0;
  private consecutiveHealthFailures = 0;
  private readonly healthProbeIntervalMs: number;
  private readonly healthProbeTimeoutMs: number;
  private readonly initializeTimeoutMs: number;
  private readonly restartBackoffMs: number;
  private readonly maxConsecutiveHealthFailures: number;
  private readonly healthFilePath: string;
  private readonly puppeteerOpts: Record<string, unknown>;

  constructor(private opts: WwebjsOptions) {
    this.healthProbeIntervalMs = opts.healthProbeIntervalMs ?? 60_000;
    this.healthProbeTimeoutMs = opts.healthProbeTimeoutMs ?? 15_000;
    this.initializeTimeoutMs = opts.initializeTimeoutMs ?? 45_000;
    this.restartBackoffMs = opts.restartBackoffMs ?? 10_000;
    this.maxConsecutiveHealthFailures = opts.maxConsecutiveHealthFailures ?? 2;
    this.healthFilePath = opts.healthFilePath ?? defaultHealthFilePath();
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
    void this.initializeClient("initial");
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
  }

  private async writeHealthHeartbeat(state: string): Promise<void> {
    try {
      await mkdir(dirname(this.healthFilePath), { recursive: true });
      await writeFile(this.healthFilePath, `${new Date().toISOString()} ${state}\n`, "utf8");
    } catch (e) {
      console.error("[wwebjs] health heartbeat write failed", e);
    }
  }

  private async markUnavailable(label: string): Promise<void> {
    await markPresenceUnavailable(this.client, Math.min(this.healthProbeTimeoutMs, 2_000), label);
  }

  private async initializeClient(reason: string): Promise<void> {
    try {
      await withTimeout(
        this.client.initialize(),
        this.initializeTimeoutMs,
        `WhatsApp initialize (${reason})`,
      );
      const generation = this.generation;
      this.readyWatchdog = setTimeout(() => {
        if (!this.stopped && generation === this.generation && !this.healthProbe) {
          void this.restart(`ready timeout after initialize (${reason})`);
        }
      }, this.initializeTimeoutMs);
    } catch (e) {
      if (this.stopped) return;
      console.error(`[wwebjs] initialize failed (${reason}); retrying after ${this.restartBackoffMs}ms`, e);
      this.client.removeAllListeners();
      await this.client.destroy().catch((destroyError: unknown) => {
        console.error("[wwebjs] destroy after initialize failure failed", destroyError);
      });
      await new Promise((resolveDelay) => setTimeout(resolveDelay, this.restartBackoffMs));
      if (this.stopped) return;
      this.generation += 1;
      this.readyPromise = this.newReadyPromise();
      this.client = this.createClient();
      this.wireEvents(this.generation);
      await this.initializeClient("retry");
    }
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
      this.consecutiveHealthFailures = 0;
      await this.writeHealthHeartbeat(String(state));
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
      if (this.readyWatchdog) {
        clearTimeout(this.readyWatchdog);
        this.readyWatchdog = undefined;
      }

      const oldClient = this.client;
      oldClient.removeAllListeners();
      await markPresenceUnavailable(
        oldClient,
        Math.min(this.healthProbeTimeoutMs, 2_000),
        "WhatsApp presence before restart",
      );
      await oldClient.destroy().catch((e: unknown) => {
        console.error("[wwebjs] destroy during restart failed", e);
      });

      this.generation += 1;
      this.readyPromise = this.newReadyPromise();
      this.client = this.createClient();
      this.wireEvents(this.generation);
      await this.initializeClient(reason);
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
      if (this.readyWatchdog) {
        clearTimeout(this.readyWatchdog);
        this.readyWatchdog = undefined;
      }
      this.consecutiveHealthFailures = 0;
      this.readyResolve();
      void this.writeHealthHeartbeat("READY");
      void this.markUnavailable("WhatsApp presence after ready");
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
    const target = msg.to.includes("@") ? msg.to : `${msg.to}@c.us`;
    if (this.restarting) await this.restarting;
    await this.ready();
    const client = this.client;
    try {
      const sent = await client.sendMessage(target, msg.body);
      this.recentOutgoingBodies.push({ body: msg.body, sentAt: Date.now() });
      void markPresenceUnavailable(
        client,
        Math.min(this.healthProbeTimeoutMs, 2_000),
        "WhatsApp presence after send",
      );
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
    if (this.readyWatchdog) clearTimeout(this.readyWatchdog);
    this.client.removeAllListeners();
    await this.markUnavailable("WhatsApp presence before destroy");
    await this.client.destroy();
  }
}
