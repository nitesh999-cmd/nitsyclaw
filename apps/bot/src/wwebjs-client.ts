// Concrete WhatsAppClient backed by whatsapp-web.js.
// This is the ONLY file that imports whatsapp-web.js (Constitution R16).

import wweb from "whatsapp-web.js";
const { Client, LocalAuth } = wweb;
type WwebjsClientInstance = InstanceType<typeof Client>;
type Message = wweb.Message;
type WwebMessageWithEnvelope = Message & {
  fromMe?: boolean;
  from?: string;
  to?: string;
};

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import qrcode from "qrcode-terminal";
import type {
  InboundMessage,
  OutboundMessage,
  WhatsAppClient,
} from "@nitsyclaw/shared/whatsapp";
import { redactAuditString } from "@nitsyclaw/shared/db";
import {
  isHealthyWhatsAppState,
  shouldRestartWhatsAppClient,
  type WhatsAppRuntimeEvent,
  withTimeout,
} from "./whatsapp-health.js";
import { isOwnerSelfChat, normalizeWhatsAppOwnerId } from "./whatsapp-identity.js";
import { WhatsAppEchoGuard, isStartupReplay } from "./whatsapp-echo-guard.js";
import {
  markPresenceUnavailable,
  parsePresenceUnavailableIntervalMs,
} from "./whatsapp-presence.js";
import { formatSafeLogError, logBotError } from "./safe-log.js";

const PUPPETEER_ARGS = process.platform === "win32"
  ? ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  : ["--no-sandbox", "--disable-setuid-sandbox", "--single-process", "--no-zygote", "--disable-dev-shm-usage"];
const WHATSAPP_HANDLER_FAILURE_REPLY =
  "I hit a backend error before I could finish that. I logged it and WhatsApp is still running. Please try again in a moment.";

function messageMeta(body: string): string {
  return `chars=${body.length}`;
}

function shouldPrintQrToLogs(): boolean {
  return process.env.NITSYCLAW_PRINT_QR_TO_LOGS === "1" && process.env.NODE_ENV !== "production";
}

function defaultHealthFilePath(): string {
  const cwd = process.cwd();
  if (cwd.replaceAll("\\", "/").endsWith("/apps/bot")) {
    return resolve(cwd, "../../logs/whatsapp-health-last-ok.txt");
  }
  return resolve(cwd, "logs/whatsapp-health-last-ok.txt");
}

function safeRuntimeReason(reason: string | undefined): string | undefined {
  return reason ? redactAuditString(reason) : undefined;
}

function safeRestartReason(label: string, error: unknown): string {
  return `${label}: ${formatSafeLogError(error)}`;
}

function addressKind(value: string): string {
  if (!value) return "empty";
  if (value.endsWith("@g.us")) return "group";
  if (value.endsWith("@newsletter")) return "newsletter";
  if (value === "status@broadcast") return "status";
  if (value.endsWith("@lid")) return "lid";
  if (value.endsWith("@c.us")) return "contact";
  return "other";
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
  presenceUnavailableIntervalMs?: number;
  healthFilePath?: string;
  onStatus?: (event: WhatsAppRuntimeEvent) => void | Promise<void>;
}

export class WwebjsClient implements WhatsAppClient {
  private echoGuard = new WhatsAppEchoGuard();
  private readonly acceptMessagesAfterMs = Date.now();
  private client: WwebjsClientInstance;
  private handlers: Array<(m: InboundMessage) => Promise<void> | void> = [];
  private readyPromise: Promise<void>;
  private readyResolvers: Array<() => void> = [];
  private healthProbe?: NodeJS.Timeout;
  private presenceUnavailableProbe?: NodeJS.Timeout;
  private readyWatchdog?: NodeJS.Timeout;
  private restarting?: Promise<void>;
  private stopped = false;
  private qrPending = false;
  private generation = 0;
  private consecutiveHealthFailures = 0;
  private readonly healthProbeIntervalMs: number;
  private readonly healthProbeTimeoutMs: number;
  private readonly initializeTimeoutMs: number;
  private readonly restartBackoffMs: number;
  private readonly maxConsecutiveHealthFailures: number;
  private readonly presenceUnavailableIntervalMs: number;
  private readonly healthFilePath: string;
  private readonly puppeteerOpts: Record<string, unknown>;

  constructor(private opts: WwebjsOptions) {
    this.healthProbeIntervalMs = opts.healthProbeIntervalMs ?? 60_000;
    this.healthProbeTimeoutMs = opts.healthProbeTimeoutMs ?? 15_000;
    this.initializeTimeoutMs = opts.initializeTimeoutMs ?? 45_000;
    this.restartBackoffMs = opts.restartBackoffMs ?? 10_000;
    this.maxConsecutiveHealthFailures = opts.maxConsecutiveHealthFailures ?? 2;
    this.presenceUnavailableIntervalMs = parsePresenceUnavailableIntervalMs(
      opts.presenceUnavailableIntervalMs,
    );
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
    return new Promise((res) => { this.readyResolvers.push(res); });
  }

  private resolveReadyWaiters(): void {
    const resolvers = this.readyResolvers.splice(0);
    for (const resolveReady of resolvers) resolveReady();
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

  private startHealthProbe(): void {
    if (this.healthProbeIntervalMs <= 0) return;
    if (this.healthProbe) clearInterval(this.healthProbe);
    this.healthProbe = setInterval(() => void this.probeHealth(), this.healthProbeIntervalMs);
  }

  private startPresenceUnavailableProbe(): void {
    if (this.presenceUnavailableIntervalMs <= 0) return;
    if (this.presenceUnavailableProbe) clearInterval(this.presenceUnavailableProbe);
    this.presenceUnavailableProbe = setInterval(
      () => void this.markUnavailable("WhatsApp periodic presence unavailable"),
      this.presenceUnavailableIntervalMs,
    );
  }

  private async writeHealthHeartbeat(state: string): Promise<void> {
    try {
      await mkdir(dirname(this.healthFilePath), { recursive: true });
      await writeFile(this.healthFilePath, `${new Date().toISOString()} ${state}\n`, "utf8");
    } catch (e) {
      logBotError("[wwebjs] health heartbeat write failed", e);
    }
  }

  private emitStatus(event: WhatsAppRuntimeEvent): void {
    const safeEvent = {
      ...event,
      reason: safeRuntimeReason(event.reason),
      at: event.at ?? new Date().toISOString(),
    };
    Promise.resolve(this.opts.onStatus?.(safeEvent)).catch((e) => {
      logBotError("[wwebjs] status callback failed", e);
    });
  }

  private async markUnavailable(label: string): Promise<void> {
    await markPresenceUnavailable(this.client, Math.min(this.healthProbeTimeoutMs, 2_000), label);
  }

  private async sendHandlerFailureReply(canSendFailureReply: boolean): Promise<void> {
    if (!canSendFailureReply) return;
    try {
      await this.send({
        to: this.opts.ownerNumber,
        body: WHATSAPP_HANDLER_FAILURE_REPLY,
      });
    } catch (fallbackError) {
      logBotError("[wwebjs] handler failure fallback send failed", fallbackError);
    }
  }

  private async initializeClient(reason: string): Promise<void> {
    try {
      this.emitStatus({ status: "initializing", reason });
      await withTimeout(
        this.client.initialize(),
        this.initializeTimeoutMs,
        `WhatsApp initialize (${reason})`,
      );
      const generation = this.generation;
      this.readyWatchdog = setTimeout(() => {
        if (!this.stopped && generation === this.generation && !this.healthProbe && !this.qrPending) {
          void this.restart(`ready timeout after initialize (${reason})`);
        } else if (!this.stopped && generation === this.generation && this.qrPending) {
          this.emitStatus({ status: "qr_required", qrAvailable: true });
        }
      }, this.initializeTimeoutMs);
    } catch (e) {
      if (this.stopped) return;
      logBotError("[wwebjs] initialize failed; retrying", e, { reason, restartBackoffMs: this.restartBackoffMs });
      this.emitStatus({ status: "restarting", reason: safeRestartReason("initialize failed", e) });
      this.client.removeAllListeners();
      await this.client.destroy().catch((destroyError: unknown) => {
        logBotError("[wwebjs] destroy after initialize failure failed", destroyError);
      });
      await new Promise((resolveDelay) => setTimeout(resolveDelay, this.restartBackoffMs));
      if (this.stopped) return;
      this.generation += 1;
      this.qrPending = false;
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
      this.emitStatus({ status: "health_ok", state: String(state) });
    } catch (e) {
      this.consecutiveHealthFailures += 1;
      logBotError("[wwebjs] health probe failed", e, {
        consecutiveHealthFailures: this.consecutiveHealthFailures,
        maxConsecutiveHealthFailures: this.maxConsecutiveHealthFailures,
      });
      this.emitStatus({
        status: "health_failed",
        reason: formatSafeLogError(e),
        consecutiveFailures: this.consecutiveHealthFailures,
      });
      if (
        shouldRestartWhatsAppClient(
          this.consecutiveHealthFailures,
          this.maxConsecutiveHealthFailures,
        )
      ) {
        await this.restart(safeRestartReason("health probe failed", e));
      }
    }
  }

  private async restart(reason: string): Promise<void> {
    if (this.stopped) return;
    if (this.restarting) return this.restarting;

    this.restarting = (async () => {
      console.error(`[wwebjs] restarting client: ${safeRuntimeReason(reason)}`);
      this.emitStatus({ status: "restarting", reason });
      if (this.healthProbe) {
        clearInterval(this.healthProbe);
        this.healthProbe = undefined;
      }
      if (this.presenceUnavailableProbe) {
        clearInterval(this.presenceUnavailableProbe);
        this.presenceUnavailableProbe = undefined;
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
        logBotError("[wwebjs] destroy during restart failed", e);
      });

      this.generation += 1;
      this.qrPending = false;
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
      this.qrPending = true;
      if (shouldPrintQrToLogs()) {
        qrcode.generate(qr, { small: true });
      } else {
        console.log("[wwebjs] QR payload hidden; set NITSYCLAW_PRINT_QR_TO_LOGS=1 outside production for local setup.");
      }
      void this.writeHealthHeartbeat("QR_REQUIRED");
      this.emitStatus({ status: "qr_required", qrAvailable: true });
    });
    this.client.on("ready", () => {
      if (!isCurrentGeneration()) return;
      console.log("[wwebjs] client ready");
      this.qrPending = false;
      if (this.readyWatchdog) {
        clearTimeout(this.readyWatchdog);
        this.readyWatchdog = undefined;
      }
      this.consecutiveHealthFailures = 0;
      this.resolveReadyWaiters();
      void this.writeHealthHeartbeat("READY");
      this.emitStatus({ status: "ready" });
      void this.markUnavailable("WhatsApp presence after ready");
      this.startHealthProbe();
      this.startPresenceUnavailableProbe();
    });
    this.client.on("change_state", (state: unknown) => {
      if (!isCurrentGeneration()) return;
      console.log("[wwebjs] state", state);
    });
    this.client.on("auth_failure", (err: unknown) => {
      if (!isCurrentGeneration()) return;
      logBotError("[wwebjs] auth_failure", err);
      this.emitStatus({ status: "auth_failure", reason: formatSafeLogError(err) });
      void this.restart(safeRestartReason("auth_failure", err));
    });
    this.client.on("disconnected", (reason: unknown) => {
      if (!isCurrentGeneration()) return;
      logBotError("[wwebjs] disconnected", reason);
      this.emitStatus({ status: "disconnected", reason: formatSafeLogError(reason) });
      void this.restart(safeRestartReason("disconnected", reason));
    });

    const handleMessage = async (m: Message) => {
      if (!isCurrentGeneration()) return;
      let canSendFailureReply = false;
      try {
        const body = m.body ?? "";
        const envelope = m as WwebMessageWithEnvelope;
        const fromMe = envelope.fromMe;
        const messageId = m.id?._serialized ?? "";

        if (
          isStartupReplay(
            typeof m.timestamp === "number" ? m.timestamp : undefined,
            Boolean(fromMe),
            this.acceptMessagesAfterMs,
          )
        ) {
          console.log(`[wwebjs] dropped: startup replay id=${messageId}`);
          return;
        }

        if (!this.echoGuard.firstSeenMessage(messageId)) {
          console.log(`[wwebjs] dropped: duplicate event id=${messageId}`);
          return;
        }

        if (fromMe && this.echoGuard.isOutgoingEcho(body)) {
          console.log(`[wwebjs] dropped: bot echo ${messageMeta(body)}`);
          return;
        }

        // SELF-CHAT ONLY: NitsyClaw must only respond to messages in YOUR self-chat,
        // not when you're typing in conversations with other contacts.
        const fromRaw = envelope.from ?? "";
        const from = normalizeWhatsAppOwnerId(fromRaw);
        const toRaw = envelope.to ?? "";
        let chatId = "";
        try {
          const chat = await m.getChat();
          chatId = chat.id?._serialized ?? "";
        } catch (chatError) {
          logBotError("[wwebjs] failed to read chat id", chatError);
        }
        if (
          !isOwnerSelfChat({
            from: fromRaw,
            fromMe,
            to: toRaw,
            chatId,
            ownerNumber: this.opts.ownerNumber,
          })
        ) {
          console.log(`[wwebjs] dropped: not self-chat fromMe=${fromMe} from=${addressKind(fromRaw)} to=${addressKind(toRaw)} chat=${addressKind(chatId)}`);
          return;
        }

        console.log(`[wwebjs] inbound: fromMe=${fromMe} ${messageMeta(body)} hasMedia=${m.hasMedia}`);

        if (
          this.opts.onlyOwner !== false &&
          fromMe !== true &&
          from !== normalizeWhatsAppOwnerId(this.opts.ownerNumber)
        ) {
          console.log("[wwebjs] dropped: non-owner inbound");
          return;
        }
        canSendFailureReply = true;

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
        logBotError("[wwebjs] handler error", e);
        await this.sendHandlerFailureReply(canSendFailureReply);
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
      this.echoGuard.rememberOutgoing(msg.body);
      const sent = await client.sendMessage(target, msg.body);
      void markPresenceUnavailable(
        client,
        Math.min(this.healthProbeTimeoutMs, 2_000),
        "WhatsApp presence after send",
      );
      return { id: sent.id?._serialized ?? "" };
    } catch (e) {
      void this.restart(safeRestartReason("send failed", e));
      throw e;
    }
  }

  onMessage(handler: (m: InboundMessage) => Promise<void> | void): void {
    this.handlers.push(handler);
  }

  async destroy(): Promise<void> {
    this.stopped = true;
    this.emitStatus({ status: "stopped" });
    if (this.healthProbe) clearInterval(this.healthProbe);
    if (this.presenceUnavailableProbe) clearInterval(this.presenceUnavailableProbe);
    if (this.readyWatchdog) clearTimeout(this.readyWatchdog);
    this.client.removeAllListeners();
    await this.markUnavailable("WhatsApp presence before destroy");
    await this.client.destroy();
  }
}
