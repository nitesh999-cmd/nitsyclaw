import {
  getSystemHeartbeat,
  upsertSystemHeartbeat,
  type DB,
} from "@nitsyclaw/shared/db";
import type {
  WhatsAppOutboundAckState,
  WhatsAppOutboundAckStateStore,
} from "./whatsapp-outbound-submission.js";

export const WHATSAPP_OUTBOUND_ACK_HEARTBEAT_SOURCE = "whatsapp-outbound-ack";

export class WhatsAppHeartbeatAckStateStore implements WhatsAppOutboundAckStateStore {
  constructor(private readonly db: DB) {}

  async load(): Promise<unknown> {
    const heartbeat = await getSystemHeartbeat(
      this.db,
      WHATSAPP_OUTBOUND_ACK_HEARTBEAT_SOURCE,
    );
    const metadata = heartbeat?.metadata as { state?: unknown } | null;
    return metadata?.state;
  }

  async save(state: WhatsAppOutboundAckState): Promise<void> {
    const hasUnacknowledged = state.attempts.some((attempt) =>
      attempt.ack < 1 && !attempt.deadlineExpiredAtMs
    );
    const hasConditional = state.attempts.some((attempt) =>
      attempt.ack < 1 && Boolean(attempt.deadlineExpiredAtMs)
    );
    await upsertSystemHeartbeat(this.db, {
      source: WHATSAPP_OUTBOUND_ACK_HEARTBEAT_SOURCE,
      status: hasUnacknowledged ? "pending" : hasConditional ? "conditional" : "ok",
      metadata: { state },
    });
  }
}
