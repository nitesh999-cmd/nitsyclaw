// Constitution R16: features depend ONLY on this interface.
// whatsapp-web.js must never be imported by feature code.

export interface InboundMessage {
  id: string;
  from: string;
  body: string;
  timestamp: Date;
  hasMedia: boolean;
  mediaType?: "image" | "voice" | "document";
  /** Returns the binary blob for media messages. */
  downloadMedia?: () => Promise<{ data: Buffer; mimetype: string; filename?: string }>;
}

export interface OutboundMessage {
  to: string;
  body: string;
  /** Optional reply-to id for threaded behavior. */
  quotedMessageId?: string;
}

/**
 * The single transport contract. Implementations:
 *   - WwebjsClient        (apps/bot/src/wwebjs-client.ts) — production Path B
 *   - MockWhatsAppClient  (./mock.ts)                     — tests
 *   - CloudApiClient      (future)                        — Path A migration
 */
export interface WhatsAppClient {
  /** Resolves once authenticated. */
  ready(): Promise<void>;
  send(msg: OutboundMessage): Promise<{ id: string }>;
  /** Register an inbound handler. Multiple registrations supported. */
  onMessage(handler: (msg: InboundMessage) => Promise<void> | void): void;
  /** Graceful shutdown. */
  destroy(): Promise<void>;
}
