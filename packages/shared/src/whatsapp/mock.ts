import type { InboundMessage, OutboundMessage, WhatsAppClient } from "./client.js";

/**
 * In-memory WhatsApp client for tests.
 * Records every send; lets tests inject inbound messages.
 */
export class MockWhatsAppClient implements WhatsAppClient {
  public sent: OutboundMessage[] = [];
  private handlers: Array<(m: InboundMessage) => Promise<void> | void> = [];
  private destroyed = false;

  async ready(): Promise<void> {
    /* always ready */
  }

  async send(msg: OutboundMessage): Promise<{ id: string }> {
    if (this.destroyed) throw new Error("client destroyed");
    this.sent.push(msg);
    return { id: `mock-${this.sent.length}` };
  }

  onMessage(handler: (m: InboundMessage) => Promise<void> | void): void {
    this.handlers.push(handler);
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    this.handlers = [];
  }

  /** Test helper: simulate an inbound message. */
  async inject(partial: Partial<InboundMessage> & { from: string; body: string }): Promise<void> {
    const msg: InboundMessage = {
      id: partial.id ?? `inj-${Date.now()}`,
      from: partial.from,
      body: partial.body,
      timestamp: partial.timestamp ?? new Date(),
      hasMedia: partial.hasMedia ?? false,
      mediaType: partial.mediaType,
      downloadMedia: partial.downloadMedia,
    };
    for (const h of this.handlers) await h(msg);
  }

  reset(): void {
    this.sent = [];
    this.handlers = [];
    this.destroyed = false;
  }
}
