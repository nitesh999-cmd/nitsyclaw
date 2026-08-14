import { createHash } from "node:crypto";
import type {
  InboundMessage,
  OutboundMessage,
  OutboundSendResult,
  WhatsAppClient,
} from "@nitsyclaw/shared/whatsapp";
import { pushNotify } from "@nitsyclaw/shared/notify";
import {
  claimSystemNotification,
  getSystemHeartbeat,
  upsertSystemHeartbeat,
  type SystemHeartbeat,
} from "@nitsyclaw/shared/db";
import type { DB } from "@nitsyclaw/shared/db";
import { sanitizeUserFacingReply } from "@nitsyclaw/shared/utils";
import { formatSafeLogError, logBotError } from "./safe-log.js";

export interface WhatsAppSendMonitorOptions {
  db: DB;
  now?: () => Date;
  failureNotifyCooldownMs?: number;
}

// Persistent cooldown: repeated sends can fail in a tight loop during a
// browser outage. One actionable alert per failure class every 30 minutes is
// enough; recovery gets its own state-change notification.
const DEFAULT_FAILURE_NOTIFY_COOLDOWN_MS = 30 * 60 * 1000;

export class WhatsAppSendMonitor implements WhatsAppClient {
  private readonly now: () => Date;
  private readonly failureNotifyCooldownMs: number;
  private lastFailureNotifyAtMs = 0;
  private lastFailureFingerprint = "";

  constructor(
    private readonly inner: WhatsAppClient,
    private readonly opts: WhatsAppSendMonitorOptions,
  ) {
    this.now = opts.now ?? (() => new Date());
    this.failureNotifyCooldownMs = opts.failureNotifyCooldownMs ?? DEFAULT_FAILURE_NOTIFY_COOLDOWN_MS;
  }

  ready(): Promise<void> {
    return this.inner.ready();
  }

  async send(msg: OutboundMessage): Promise<OutboundSendResult> {
    const body = msg.media ? "" : sanitizeUserFacingReply(msg.body);
    if (!body && !msg.media) {
      await upsertSystemHeartbeat(this.opts.db, {
        // Suppression is not delivery evidence and must never clear a real
        // outbound failure or make the send path appear healthy.
        source: "whatsapp-send-suppressed",
        status: "ok",
        metadata: {
          at: this.now().toISOString(),
          suppressed: "noisy_receipt",
        },
      }).catch((heartbeatError) => {
        logBotError("[whatsapp-send-monitor] failed to write suppressed send heartbeat", heartbeatError);
      });
      return { id: "suppressed-noisy-receipt" };
    }

    try {
      const result = await this.inner.send({ ...msg, body });
      const previous = await this.readSendHeartbeat();
      await upsertSystemHeartbeat(this.opts.db, {
        source: "whatsapp-send",
        status: "ok",
        metadata: {
          at: this.now().toISOString(),
          lastMessageIdHash: hashOperationalId(result.id),
          ...(result.ack !== undefined ? { ack: result.ack } : {}),
          ...(result.delivery ? { delivery: result.delivery } : {}),
        },
      }).catch((heartbeatError) => {
        logBotError("[whatsapp-send-monitor] failed to clear send heartbeat", heartbeatError);
      });
      if (previous?.status === "error") {
        await this.pushRecovery(previous);
      }
      return result;
    } catch (e) {
      const errorClass = classifySendFailure(e);
      await upsertSystemHeartbeat(this.opts.db, {
        source: "whatsapp-send",
        status: "error",
        metadata: {
          error: errorClass,
          at: this.now().toISOString(),
        },
      }).catch((heartbeatError) => {
        logBotError("[whatsapp-send-monitor] failed to write heartbeat", heartbeatError);
      });
      if (await this.shouldPushFailure(errorClass)) {
        pushNotify("WhatsApp outbound delivery failed. Check WhatsApp health before retrying.", {
          title: "NitsyClaw WhatsApp send failed",
          priority: "urgent",
        }).catch(() => {});
      }
      throw e;
    }
  }

  private async shouldPushFailure(errorClass: string): Promise<boolean> {
    const claimed = await claimSystemNotification(this.opts.db, {
      source: "whatsapp-send-alert:failure",
      fingerprint: `failure:${errorClass}`,
      now: this.now(),
      cooldownMs: this.failureNotifyCooldownMs,
      metadata: { kind: "failure", errorClass },
    }).catch(() => undefined);
    if (claimed !== undefined) return claimed;

    // If persistent coordination is temporarily unavailable, retain a local
    // fallback so a DB outage does not turn one send fault into an alert storm.
    const nowMs = this.now().getTime();
    const fingerprint = errorClass;
    if (
      this.lastFailureFingerprint === fingerprint &&
      nowMs - this.lastFailureNotifyAtMs < this.failureNotifyCooldownMs
    ) {
      return false;
    }
    this.lastFailureFingerprint = fingerprint;
    this.lastFailureNotifyAtMs = nowMs;
    return true;
  }

  private async readSendHeartbeat(): Promise<SystemHeartbeat | null> {
    return getSystemHeartbeat(this.opts.db, "whatsapp-send").catch(() => null);
  }

  private async pushRecovery(previous: SystemHeartbeat): Promise<void> {
    const previousError = typeof previous.metadata === "object" && previous.metadata !== null
      ? String((previous.metadata as Record<string, unknown>).error ?? "unknown")
      : "unknown";
    const claimed = await claimSystemNotification(this.opts.db, {
      source: "whatsapp-send-alert:recovery",
      fingerprint: `recovery:${previousError.slice(0, 80)}`,
      now: this.now(),
      cooldownMs: this.failureNotifyCooldownMs,
      metadata: { kind: "recovery" },
    }).catch(() => false);
    if (!claimed) return;
    pushNotify("WhatsApp outbound delivery recovered after a recorded failure.", {
      title: "NitsyClaw WhatsApp recovered",
      priority: "default",
    }).catch(() => {});
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void> | void): void {
    this.inner.onMessage(handler);
  }

  destroy(): Promise<void> {
    return this.inner.destroy();
  }
}

function hashOperationalId(value: string): string {
  // Message identifiers are correlators, not dashboard content.
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function classifySendFailure(error: unknown): string {
  const safe = formatSafeLogError(error).toLowerCase();
  if (/target closed|session closed|browser.+closed/.test(safe)) return "browser_closed";
  if (/timed? out|timeout/.test(safe)) return "timeout";
  if (/\b401\b|unauthori[sz]ed|authentication/.test(safe)) return "authentication";
  if (/econnreset|econnrefused|network|fetch failed/.test(safe)) return "network";
  return "send_failed";
}
