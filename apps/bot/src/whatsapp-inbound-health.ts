// Inbound routing health signal.
//
// The nightly report must not claim WhatsApp is fully healthy while genuine
// owner self-chat messages are dropped because LID identity resolution keeps
// failing. This tracker keeps counters only - never bodies, phone numbers,
// lids, or message ids.

export type InboundDropReason =
  | "startup_replay"
  | "duplicate_event"
  | "bot_echo"
  | "not_self_chat"
  | "lid_identity_unresolved"
  | "lid_identity_mismatch"
  | "non_owner";

export const DEFAULT_IDENTITY_FAILURE_THRESHOLD = 2;

export interface InboundRoutingSnapshot {
  status: "ok" | "degraded";
  acceptedCount: number;
  droppedCount: number;
  dropsByReason: Record<string, number>;
  ownerSelfChatIdentityFailures: number;
  lastAcceptedAt?: string;
  lastIdentityFailureAt?: string;
  at: string;
}

export class InboundRoutingHealth {
  private acceptedCount = 0;
  private droppedCount = 0;
  private readonly dropsByReason = new Map<InboundDropReason, number>();
  private identityFailures = 0;
  private lastAcceptedAt?: string;
  private lastIdentityFailureAt?: string;
  private readonly now: () => Date;
  private readonly identityFailureThreshold: number;

  constructor(opts: { now?: () => Date; identityFailureThreshold?: number } = {}) {
    this.now = opts.now ?? (() => new Date());
    this.identityFailureThreshold =
      opts.identityFailureThreshold ?? DEFAULT_IDENTITY_FAILURE_THRESHOLD;
  }

  recordAccepted(): void {
    this.acceptedCount += 1;
    this.lastAcceptedAt = this.now().toISOString();
    this.identityFailures = 0;
  }

  recordDrop(reason: InboundDropReason): void {
    this.droppedCount += 1;
    this.dropsByReason.set(reason, (this.dropsByReason.get(reason) ?? 0) + 1);
    // A mismatch is a correct rejection (owner messaging somebody else), so it
    // must not raise an alarm. Only failed resolution of a self-chat candidate
    // means genuine owner traffic may be getting dropped.
    if (reason === "lid_identity_unresolved") {
      this.identityFailures += 1;
      this.lastIdentityFailureAt = this.now().toISOString();
    }
  }

  snapshot(): InboundRoutingSnapshot {
    return {
      status: this.identityFailures >= this.identityFailureThreshold ? "degraded" : "ok",
      acceptedCount: this.acceptedCount,
      droppedCount: this.droppedCount,
      dropsByReason: Object.fromEntries(this.dropsByReason),
      ownerSelfChatIdentityFailures: this.identityFailures,
      lastAcceptedAt: this.lastAcceptedAt,
      lastIdentityFailureAt: this.lastIdentityFailureAt,
      at: this.now().toISOString(),
    };
  }
}
