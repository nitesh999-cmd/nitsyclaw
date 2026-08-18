// Inbound acceptance gate for WhatsApp events.
//
// Same order the wwebjs client has always used:
//   startup replay -> duplicate event -> bot echo -> owner self-chat -> owner-only.
// Chat identity is read lazily so cheap drops (replay, duplicate, echo) never
// pay for a WhatsApp chat lookup. The only new step is LID identity resolution,
// which runs ONLY when the plain envelope rules already said "no" and the
// envelope looks like an owner-authored self-chat addressed by @lid.

import { isOwnerSelfChat, normalizeWhatsAppOwnerId } from "./whatsapp-identity.js";
import { isStartupReplay } from "./whatsapp-echo-guard.js";
import type { InboundDropReason } from "./whatsapp-inbound-health.js";
import type { LidSelfChatEnvelope, LidSelfChatVerdict } from "./whatsapp-lid-identity.js";

export type InboundGateDecision =
  | { action: "accept" }
  | { action: "drop"; reason: InboundDropReason };

export interface InboundChatIdentity {
  chatId: string;
  chatIsMe: boolean;
  allowedSelfChatIds?: string[];
}

export interface InboundGateEnvelope {
  messageId: string;
  body: string;
  timestampSeconds?: number;
  fromMe: boolean;
  from: string;
  to: string;
  readChatIdentity: () => Promise<InboundChatIdentity>;
}

export interface InboundGateDeps {
  echoGuard: {
    firstSeenMessage(id: string): boolean;
    isOutgoingEcho(body: string): boolean;
  };
  ownerNumber: string;
  acceptMessagesAfterMs: number;
  onlyOwner?: boolean;
  resolveLidSelfChat?: (args: LidSelfChatEnvelope) => Promise<LidSelfChatVerdict>;
}

export async function decideInboundAction(
  envelope: InboundGateEnvelope,
  deps: InboundGateDeps,
): Promise<InboundGateDecision> {
  if (isStartupReplay(envelope.timestampSeconds, envelope.fromMe, deps.acceptMessagesAfterMs)) {
    return { action: "drop", reason: "startup_replay" };
  }

  if (!deps.echoGuard.firstSeenMessage(envelope.messageId)) {
    return { action: "drop", reason: "duplicate_event" };
  }

  if (envelope.fromMe && deps.echoGuard.isOutgoingEcho(envelope.body)) {
    return { action: "drop", reason: "bot_echo" };
  }

  const chat = await envelope.readChatIdentity();

  const selfChat = isOwnerSelfChat({
    from: envelope.from,
    fromMe: envelope.fromMe,
    to: envelope.to,
    chatId: chat.chatId,
    chatIsMe: chat.chatIsMe,
    ownerNumber: deps.ownerNumber,
    allowedSelfChatIds: chat.allowedSelfChatIds,
  });

  if (!selfChat) {
    const verdict = deps.resolveLidSelfChat
      ? await deps.resolveLidSelfChat({
          fromMe: envelope.fromMe,
          from: envelope.from,
          to: envelope.to,
          chatId: chat.chatId,
          ownerNumber: deps.ownerNumber,
        })
      : "not_candidate";

    if (verdict === "rejected_identity") return { action: "drop", reason: "lid_identity_mismatch" };
    if (verdict === "unresolved") return { action: "drop", reason: "lid_identity_unresolved" };
    if (verdict !== "accepted") return { action: "drop", reason: "not_self_chat" };
  }

  if (
    deps.onlyOwner !== false &&
    envelope.fromMe !== true &&
    normalizeWhatsAppOwnerId(envelope.from) !== normalizeWhatsAppOwnerId(deps.ownerNumber)
  ) {
    return { action: "drop", reason: "non_owner" };
  }

  return { action: "accept" };
}
