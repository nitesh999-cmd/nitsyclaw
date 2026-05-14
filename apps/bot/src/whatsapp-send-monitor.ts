import type {
  InboundMessage,
  OutboundMessage,
  WhatsAppClient,
} from "@nitsyclaw/shared/whatsapp";
import { pushNotify } from "@nitsyclaw/shared/notify";
import { upsertSystemHeartbeat } from "@nitsyclaw/shared/db";
import type { DB } from "@nitsyclaw/shared/db";
import { sanitizeUserFacingReply } from "@nitsyclaw/shared/utils";
import { formatSafeLogError, logBotError } from "./safe-log.js";

export interface WhatsAppSendMonitorOptions {
  db: DB;
  now?: () => Date;
}

export class WhatsAppSendMonitor implements WhatsAppClient {
  private readonly now: () => Date;

  constructor(
    private readonly inner: WhatsAppClient,
    private readonly opts: WhatsAppSendMonitorOptions,
  ) {
    this.now = opts.now ?? (() => new Date());
  }

  ready(): Promise<void> {
    return this.inner.ready();
  }

  async send(msg: OutboundMessage): Promise<{ id: string }> {
    const body = sanitizeUserFacingReply(msg.body);
    if (!body) {
      await upsertSystemHeartbeat(this.opts.db, {
        source: "whatsapp-send",
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
      await upsertSystemHeartbeat(this.opts.db, {
        source: "whatsapp-send",
        status: "ok",
        metadata: {
          at: this.now().toISOString(),
          lastMessageId: result.id,
        },
      }).catch((heartbeatError) => {
        logBotError("[whatsapp-send-monitor] failed to clear send heartbeat", heartbeatError);
      });
      return result;
    } catch (e) {
      const error = formatSafeLogError(e);
      await upsertSystemHeartbeat(this.opts.db, {
        source: "whatsapp-send",
        status: "error",
        metadata: {
          error: error.slice(0, 180),
          at: this.now().toISOString(),
        },
      }).catch((heartbeatError) => {
        logBotError("[whatsapp-send-monitor] failed to write heartbeat", heartbeatError);
      });
      pushNotify(`WhatsApp send failed: ${error.slice(0, 180)}`, {
        title: "NitsyClaw WhatsApp send failed",
        priority: "urgent",
      }).catch(() => {});
      throw e;
    }
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void> | void): void {
    this.inner.onMessage(handler);
  }

  destroy(): Promise<void> {
    return this.inner.destroy();
  }
}
