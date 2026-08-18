// Constitution R16: features depend ONLY on this interface.
// whatsapp-web.js must never be imported by feature code.

export interface InboundMessage {
  id: string;
  from: string;
  body: string;
  timestamp: Date;
  hasMedia: boolean;
  mediaType?: "image" | "voice" | "document";
  /** Provider-declared byte size when available. Never trusted without checking the decoded bytes. */
  mediaSizeBytes?: number;
  /** Provider-declared duration when available. Never trusted without probing the decoded media. */
  mediaDurationSeconds?: number;
  /** Returns the binary blob for media messages. */
  downloadMedia?: () => Promise<{ data: Buffer; mimetype: string; filename?: string }>;
}

export interface OutboundMedia {
  data: Buffer;
  mimetype: string;
  filename: string;
  kind: "voice";
}

export interface OutboundMessage {
  to: string;
  body: string;
  /** Optional reply-to id for threaded behavior. */
  quotedMessageId?: string;
  /** Validated binary media. Production currently permits generated voice notes only. */
  media?: OutboundMedia;
  /** Explicit transport choice; auto delegates to the owner voice-reply policy. */
  deliveryPreference?: "text" | "voice" | "auto";
  /** False for progress receipts that must not close the source voice lifecycle. */
  finalResponse?: boolean;
}

export interface OutboundSendResult {
  id: string;
  ack?: number;
  delivery?: "server_submitted" | "device_acknowledged";
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
  send(msg: OutboundMessage): Promise<OutboundSendResult>;
  /** Register an inbound handler. Multiple registrations supported. */
  onMessage(handler: (msg: InboundMessage) => Promise<void> | void): void;
  /** Graceful shutdown. */
  destroy(): Promise<void>;
}
