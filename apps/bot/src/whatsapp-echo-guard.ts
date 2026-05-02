export class WhatsAppEchoGuard {
  private outgoing: Array<{ body: string; sentAt: number }> = [];
  private seenMessageIds = new Map<string, number>();

  constructor(
    private readonly now = () => Date.now(),
    private readonly outgoingTtlMs = 15_000,
    private readonly messageIdTtlMs = 2 * 60 * 1000,
  ) {}

  rememberOutgoing(body: string): void {
    this.prune();
    this.outgoing.push({ body: this.normalize(body), sentAt: this.now() });
  }

  isOutgoingEcho(body: string): boolean {
    this.prune();
    const normalized = this.normalize(body);
    return this.outgoing.some((entry) => entry.body === normalized);
  }

  firstSeenMessage(id: string): boolean {
    if (!id) return true;
    this.prune();
    if (this.seenMessageIds.has(id)) return false;
    this.seenMessageIds.set(id, this.now());
    return true;
  }

  private prune(): void {
    const now = this.now();
    const outgoingCutoff = now - this.outgoingTtlMs;
    const messageIdCutoff = now - this.messageIdTtlMs;
    this.outgoing = this.outgoing
      .filter((entry) => entry.sentAt >= outgoingCutoff)
      .slice(-100);
    for (const [id, seenAt] of this.seenMessageIds) {
      if (seenAt < messageIdCutoff) this.seenMessageIds.delete(id);
    }
  }

  private normalize(body: string): string {
    return body.replace(/\r\n/g, "\n").trim();
  }
}

export function isStartupReplay(
  timestampSeconds: number | undefined,
  fromMe: boolean,
  acceptMessagesAfterMs: number,
  graceMs = 5_000,
): boolean {
  if (!fromMe || !timestampSeconds) return false;
  return timestampSeconds * 1000 < acceptMessagesAfterMs - graceMs;
}
