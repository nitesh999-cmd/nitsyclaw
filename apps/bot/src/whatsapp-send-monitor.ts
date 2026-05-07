import type {
  InboundMessage,
  OutboundMessage,
  WhatsAppClient,
} from "@nitsyclaw/shared/whatsapp";
import { pushNotify } from "@nitsyclaw/shared/notify";
import { upsertSystemHeartbeat } from "@nitsyclaw/shared/db";
import type { DB } from "@nitsyclaw/shared/db";
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
    try {
      return await this.inner.send(msg);
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
