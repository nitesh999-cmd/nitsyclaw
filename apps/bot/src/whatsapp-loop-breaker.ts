import type {
  InboundMessage,
  OutboundMessage,
  WhatsAppClient,
} from "@nitsyclaw/shared/whatsapp";

export interface LoopBreakerOptions {
  now?: () => number;
  outboundTtlMs?: number;
  maxSendsPerWindow?: number;
  sendWindowMs?: number;
  sendBurstCooldownMs?: number;
  onTrip?: (incident: LoopBreakerIncident) => void;
  onReset?: (reason: string) => void;
}

export interface LoopBreakerIncident {
  reason: string;
  trippedAt: string;
  resetAt?: string;
  sendCount: number;
  recentOutboundPreviews: string[];
}

const DEFAULT_MAX_SENDS_PER_WINDOW = 12;
const DEFAULT_SEND_WINDOW_MS = 90_000;
const DEFAULT_SEND_BURST_COOLDOWN_MS = 2 * 60 * 1000;
const RESUME_ACK = "WhatsApp replies resumed. Send your request again if I missed it.";

export class WhatsAppLoopBreaker implements WhatsAppClient {
  private recentOutbound: Array<{ body: string; sentAt: number }> = [];
  private recentSends: number[] = [];
  private pausedReason: string | null = null;
  private pausedUntilMs: number | null = null;
  private readonly now: () => number;
  private readonly outboundTtlMs: number;
  private readonly maxSendsPerWindow: number;
  private readonly sendWindowMs: number;
  private readonly sendBurstCooldownMs: number;
  private readonly onTrip?: (incident: LoopBreakerIncident) => void;
  private readonly onReset?: (reason: string) => void;

  constructor(
    private readonly inner: WhatsAppClient,
    opts: LoopBreakerOptions = {},
  ) {
    this.now = opts.now ?? (() => Date.now());
    this.outboundTtlMs = opts.outboundTtlMs ?? 2 * 60 * 1000;
    this.maxSendsPerWindow = opts.maxSendsPerWindow ?? DEFAULT_MAX_SENDS_PER_WINDOW;
    this.sendWindowMs = opts.sendWindowMs ?? DEFAULT_SEND_WINDOW_MS;
    this.sendBurstCooldownMs = opts.sendBurstCooldownMs ?? DEFAULT_SEND_BURST_COOLDOWN_MS;
    this.onTrip = opts.onTrip;
    this.onReset = opts.onReset;
  }

  ready(): Promise<void> {
    return this.inner.ready();
  }

  async send(msg: OutboundMessage): Promise<{ id: string }> {
    this.prune();
    this.resetIfCooldownExpired();
    if (this.isPaused()) {
      throw new Error("WhatsApp replies paused by loop breaker");
    }

    this.recentSends.push(this.now());
    if (this.recentSends.length > this.maxSendsPerWindow) {
      this.trip(
        `send burst: ${this.recentSends.length} sends in ${this.sendWindowMs}ms`,
        this.sendBurstCooldownMs,
      );
      throw new Error("WhatsApp replies paused by loop breaker");
    }

    this.recentOutbound.push({ body: this.normalize(msg.body), sentAt: this.now() });
    return this.inner.send(msg);
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void> | void): void {
    this.inner.onMessage((msg) => {
      this.prune();
      const body = this.normalize(msg.body);

      if (this.isResumeCommand(body)) {
        if (this.pausedReason) {
          this.resetPause("manual reset consumed");
          void this.inner.send({ to: msg.from, body: RESUME_ACK }).catch((e) => {
            console.error("[loop-breaker] failed to send resume acknowledgement", e);
          });
        }
        return;
      }

      this.resetIfCooldownExpired();
      if (this.isPaused()) {
        console.error("[loop-breaker] dropped inbound while paused");
        return;
      }

      if (body && this.recentOutbound.some((entry) => entry.body === body)) {
        this.trip("inbound matched recent outbound");
        console.error("[loop-breaker] dropped suspected self-reply echo");
        return;
      }

      return handler(msg);
    });
  }

  destroy(): Promise<void> {
    return this.inner.destroy();
  }

  isPaused(): boolean {
    this.resetIfCooldownExpired();
    return this.pausedReason !== null;
  }

  private trip(reason: string, autoResetMs?: number): void {
    if (this.pausedReason) return;
    const resetAtMs = autoResetMs ? this.now() + autoResetMs : null;
    this.pausedReason = reason;
    this.pausedUntilMs = resetAtMs;
    const incident: LoopBreakerIncident = {
      reason,
      trippedAt: new Date(this.now()).toISOString(),
      ...(resetAtMs ? { resetAt: new Date(resetAtMs).toISOString() } : {}),
      sendCount: this.recentSends.length,
      recentOutboundPreviews: this.recentOutbound
        .slice(-5)
        .map((entry) => this.preview(entry.body)),
    };
    const resetLabel = resetAtMs ? `cooling down until ${new Date(resetAtMs).toISOString()}` : "paused until manual reset";
    console.error(`[loop-breaker] ${reason}; ${resetLabel}`);
    this.onTrip?.(incident);
  }

  private resetIfCooldownExpired(): void {
    if (!this.pausedReason || !this.pausedUntilMs) return;
    if (this.now() < this.pausedUntilMs) return;
    this.resetPause("cooldown expired");
  }

  private resetPause(label: string): void {
    if (!this.pausedReason) return;
    const reason = this.pausedReason;
    this.pausedReason = null;
    this.pausedUntilMs = null;
    console.error(`[loop-breaker] ${label}; previous reason=${reason}`);
    this.onReset?.(reason);
  }

  private prune(): void {
    const now = this.now();
    this.recentOutbound = this.recentOutbound
      .filter((entry) => now - entry.sentAt <= this.outboundTtlMs)
      .slice(-100);
    this.recentSends = this.recentSends.filter((sentAt) => now - sentAt <= this.sendWindowMs);
  }

  private isResumeCommand(body: string): boolean {
    return /^(resume|unlock|restart)\s+(nitsy|bot|nitsyclaw|whatsapp|replies)$/i.test(body);
  }

  private normalize(body: string): string {
    return body.replace(/\r\n/g, "\n").trim();
  }

  private preview(body: string): string {
    return `[message ${this.normalize(body).length} chars]`;
  }
}
