export const WHATSAPP_ACK_ERROR = -1;
export const WHATSAPP_ACK_PENDING = 0;
export const WHATSAPP_ACK_SERVER = 1;
export const WHATSAPP_ACK_DEVICE = 2;

export type WhatsAppOutboundDeliveryStage =
  | "no_evidence"
  | "local_self_echo_only"
  | "client_accepted_without_id"
  | "message_id_created_pending_ack"
  | "server_submitted"
  | "device_acknowledged"
  | "user_visible_confirmed";

export interface WhatsAppOutboundDeliveryEvidence {
  localSelfEchoObserved?: boolean;
  clientAccepted?: boolean;
  messageId?: string;
  ack?: number;
  userVisibleConfirmed?: boolean;
}

export interface WhatsAppSubmissionMessage {
  id?: { _serialized?: string; toString?: () => string };
  ack?: number;
}

export interface WhatsAppSubmissionClient {
  sendMessage(
    target: string,
    body: string,
    options: { waitUntilMsgSent: true },
  ): Promise<WhatsAppSubmissionMessage | undefined>;
  on(
    event: "message_ack",
    listener: (message: WhatsAppSubmissionMessage, ack: number) => void,
  ): unknown;
  off?(
    event: "message_ack",
    listener: (message: WhatsAppSubmissionMessage, ack: number) => void,
  ): unknown;
  removeListener?(
    event: "message_ack",
    listener: (message: WhatsAppSubmissionMessage, ack: number) => void,
  ): unknown;
}

export type WhatsAppOutboundSubmissionErrorCode =
  | "submission_timeout"
  | "message_id_missing"
  | "ack_error"
  | "ack_timeout";

export class WhatsAppOutboundSubmissionError extends Error {
  constructor(
    readonly code: WhatsAppOutboundSubmissionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WhatsAppOutboundSubmissionError";
  }
}

export interface WhatsAppOutboundSubmissionResult {
  id: string;
  ack: number;
  delivery: "server_submitted" | "device_acknowledged";
}

export function classifyWhatsAppOutboundDelivery(
  evidence: WhatsAppOutboundDeliveryEvidence,
): WhatsAppOutboundDeliveryStage {
  if (evidence.userVisibleConfirmed) return "user_visible_confirmed";
  if (evidence.messageId && (evidence.ack ?? WHATSAPP_ACK_PENDING) >= WHATSAPP_ACK_DEVICE) {
    return "device_acknowledged";
  }
  if (evidence.messageId && (evidence.ack ?? WHATSAPP_ACK_PENDING) >= WHATSAPP_ACK_SERVER) {
    return "server_submitted";
  }
  if (evidence.messageId) return "message_id_created_pending_ack";
  if (evidence.clientAccepted) return "client_accepted_without_id";
  if (evidence.localSelfEchoObserved) return "local_self_echo_only";
  return "no_evidence";
}

function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: () => WhatsAppOutboundSubmissionError,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(timeoutError()), timeoutMs);
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function messageId(message: WhatsAppSubmissionMessage | undefined): string {
  const serialized = message?.id?._serialized?.trim() ?? "";
  if (serialized) return serialized;
  if (typeof message?.id?.toString !== "function") return "";
  const stringified = message.id.toString().trim();
  return stringified && stringified !== "[object Object]" ? stringified : "";
}

export async function submitWhatsAppMessageWithServerAck(
  client: WhatsAppSubmissionClient,
  args: {
    target: string;
    body: string;
    submissionTimeoutMs?: number;
    ackTimeoutMs?: number;
  },
): Promise<WhatsAppOutboundSubmissionResult> {
  const observedAcks = new Map<string, number>();
  let awaitedMessageId = "";
  let settleAck: ((ack: number) => void) | undefined;

  const ackPromise = new Promise<number>((resolve) => {
    settleAck = resolve;
  });

  const onMessageAck = (message: WhatsAppSubmissionMessage, ack: number): void => {
    const id = messageId(message);
    if (!id) return;
    const previousAck = observedAcks.get(id);
    observedAcks.set(
      id,
      ack === WHATSAPP_ACK_ERROR || previousAck === WHATSAPP_ACK_ERROR
        ? WHATSAPP_ACK_ERROR
        : Math.max(previousAck ?? WHATSAPP_ACK_PENDING, ack),
    );
    if (id !== awaitedMessageId) return;
    if (ack === WHATSAPP_ACK_ERROR || ack >= WHATSAPP_ACK_SERVER) {
      settleAck?.(ack);
    }
  };

  client.on("message_ack", onMessageAck);
  try {
    const sent = await withDeadline(
      client.sendMessage(args.target, args.body, { waitUntilMsgSent: true }),
      args.submissionTimeoutMs ?? 45_000,
      () => new WhatsAppOutboundSubmissionError(
        "submission_timeout",
        "WhatsApp did not complete outbound submission before the timeout.",
      ),
    );

    awaitedMessageId = messageId(sent);
    if (!awaitedMessageId) {
      throw new WhatsAppOutboundSubmissionError(
        "message_id_missing",
        "WhatsApp accepted the local message model without returning a real message ID.",
      );
    }

    const returnedAck = sent?.ack ?? WHATSAPP_ACK_PENDING;
    const observedAck = observedAcks.get(awaitedMessageId) ?? WHATSAPP_ACK_PENDING;
    if (returnedAck === WHATSAPP_ACK_ERROR || observedAck === WHATSAPP_ACK_ERROR) {
      throw new WhatsAppOutboundSubmissionError(
        "ack_error",
        "WhatsApp reported an outbound submission error.",
      );
    }
    const currentAck = Math.max(returnedAck, observedAck);

    const ack = currentAck >= WHATSAPP_ACK_SERVER
      ? currentAck
      : await withDeadline(
          ackPromise,
          args.ackTimeoutMs ?? 45_000,
          () => new WhatsAppOutboundSubmissionError(
            "ack_timeout",
            "WhatsApp created a message ID but did not provide a server acknowledgement before the timeout.",
          ),
        );
    if (ack === WHATSAPP_ACK_ERROR) {
      throw new WhatsAppOutboundSubmissionError(
        "ack_error",
        "WhatsApp reported an outbound submission error.",
      );
    }

    return {
      id: awaitedMessageId,
      ack,
      delivery: ack >= WHATSAPP_ACK_DEVICE ? "device_acknowledged" : "server_submitted",
    };
  } finally {
    if (client.off) {
      client.off("message_ack", onMessageAck);
    } else {
      client.removeListener?.("message_ack", onMessageAck);
    }
  }
}
