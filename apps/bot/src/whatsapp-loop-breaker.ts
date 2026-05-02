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
  onTrip?: (incident: LoopBreakerIncident) => void;
  onReset?: (reason: string) => void;
}

export interface LoopBreakerIncident {
  reason: string;
  trippedAt: string;
  sendCount: number;
  recentOutboundPreviews: string[];
}

export class WhatsAppLoopBreaker implements WhatsAppClient {
  private recentOutbound: Array<{ body: string; sentAt: number }> = [];
  private recentSends: number[] = [];
  private pausedReason: string | null = null;
  private readonly now: () => number;
  private readonly outboundTtlMs: number;
  private readonly maxSendsPerWindow: number;
  private readonly sendWindowMs: number;
  private readonly onTrip?: (incident: LoopBreakerIncident) => void;
  private readonly onReset?: (reason: string) => void;

  constructor(
    private readonly inner: WhatsAppClient,
    opts: LoopBreakerOptions = {},
  ) {
    this.now = opts.now ?? (() => Date.now());
    this.outboundTtlMs = opts.outboundTtlMs ?? 2 * 60 * 1000;
    this.maxSendsPerWindow = opts.maxSendsPerWindow ?? 6;
    this.sendWindowMs = opts.sendWindowMs ?? 90_000;
    this.onTrip = opts.onTrip;
    this.onReset = opts.onReset;
  }

  ready(): Promise<void> {
    return this.inner.ready();
  }

  async send(msg: OutboundMessage): Promise<{ id: string }> {
    this.prune();
    if (this.isPaused()) {
      throw new Error("WhatsApp replies paused by loop breaker");
    }

    this.recentSends.push(this.now());
    if (this.recentSends.length > this.maxSendsPerWindow) {
      this.trip(`send burst: ${this.recentSends.length} sends in ${this.sendWindowMs}ms`);
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
          const reason = this.pausedReason;
          this.pausedReason = null;
          console.error(`[loop-breaker] manual reset consumed; previous reason=${reason}`);
          this.onReset?.(reason);
        }
        return;
      }

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
    return this.pausedReason !== null;
  }

  private trip(reason: string): void {
    if (this.pausedReason) return;
    this.pausedReason = reason;
    const incident: LoopBreakerIncident = {
      reason,
      trippedAt: new Date(this.now()).toISOString(),
      sendCount: this.recentSends.length,
      recentOutboundPreviews: this.recentOutbound
        .slice(-5)
        .map((entry) => this.preview(entry.body)),
    };
    console.error(`[loop-breaker] ${reason}; paused until manual reset`);
    this.onTrip?.(incident);
  }

  private prune(): void {
    const now = this.now();
    this.recentOutbound = this.recentOutbound
      .filter((entry) => now - entry.sentAt <= this.outboundTtlMs)
      .slice(-100);
    this.recentSends = this.recentSends.filter((sentAt) => now - sentAt <= this.sendWindowMs);
  }

  private isResumeCommand(body: string): boolean {
    return /^(resume|unlock|restart)\s+(nitsy|bot|nitsyclaw)$/i.test(body);
  }

  private normalize(body: string): string {
    return body.replace(/\r\n/g, "\n").trim();
  }

  private preview(body: string): string {
    return this.normalize(body).slice(0, 80);
  }
}
