import { describe, expect, it, vi } from "vitest";
import { WhatsAppEchoGuard } from "./whatsapp-echo-guard.js";
import { decideInboundAction, type InboundChatIdentity } from "./whatsapp-inbound-gate.js";
import {
  LidPhoneResolver,
  resolveLidSelfChat,
  type LidPhoneRecord,
} from "./whatsapp-lid-identity.js";

const OWNER = "+61430008008";
const OWNER_CUS = "61430008008@c.us";
const OWNER_LID = "129274421981381@lid";
const OTHER_CUS = "61425046161@c.us";

function lidDeps(map: Record<string, string>) {
  const resolver = new LidPhoneResolver(async (userIds): Promise<LidPhoneRecord[]> =>
    userIds.map((id) => ({ lid: id, pn: map[id] ?? null })),
  );
  return (args: Parameters<typeof resolveLidSelfChat>[1]) => resolveLidSelfChat(resolver, args);
}

function gateDeps(overrides: Partial<Parameters<typeof decideInboundAction>[1]> = {}) {
  return {
    echoGuard: new WhatsAppEchoGuard(),
    ownerNumber: OWNER,
    acceptMessagesAfterMs: 0,
    resolveLidSelfChat: lidDeps({ [OWNER_LID]: OWNER_CUS }),
    ...overrides,
  };
}

function envelope(
  overrides: Partial<Parameters<typeof decideInboundAction>[0]> = {},
  chat: Partial<InboundChatIdentity> = {},
) {
  return {
    messageId: "msg-1",
    body: "proof test",
    timestampSeconds: undefined,
    fromMe: true,
    from: OWNER_CUS,
    to: OWNER_LID,
    readChatIdentity: async (): Promise<InboundChatIdentity> => ({
      chatId: "",
      chatIsMe: false,
      ...chat,
    }),
    ...overrides,
  };
}

describe("inbound gate - owner self-chat over LID", () => {
  it("accepts the genuine live envelope: fromMe, owner contact, owner LID, empty chat, chatIsMe false", async () => {
    const decision = await decideInboundAction(envelope(), gateDeps());
    expect(decision).toEqual({ action: "accept" });
  });

  it("rejects the identical envelope when the LID belongs to somebody else", async () => {
    const decision = await decideInboundAction(
      envelope(),
      gateDeps({ resolveLidSelfChat: lidDeps({ [OWNER_LID]: OTHER_CUS }) }),
    );
    expect(decision).toEqual({ action: "drop", reason: "lid_identity_mismatch" });
  });

  it("rejects when the LID cannot be resolved", async () => {
    const decision = await decideInboundAction(envelope(), gateDeps({ resolveLidSelfChat: lidDeps({}) }));
    expect(decision).toEqual({ action: "drop", reason: "lid_identity_unresolved" });
  });

  it("rejects a malformed LID recipient", async () => {
    const lookup = vi.fn(async (): Promise<LidPhoneRecord[]> => []);
    const resolver = new LidPhoneResolver(lookup);
    const decision = await decideInboundAction(
      envelope({ to: "@lid" }),
      gateDeps({ resolveLidSelfChat: (args) => resolveLidSelfChat(resolver, args) }),
    );
    expect(decision).toEqual({ action: "drop", reason: "lid_identity_unresolved" });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("rejects owner messages to another contact even when that chat is LID addressed", async () => {
    const otherLid = "884477221100993@lid";
    const decision = await decideInboundAction(
      envelope({ to: otherLid }),
      gateDeps({ resolveLidSelfChat: lidDeps({ [otherLid]: OTHER_CUS }) }),
    );
    expect(decision).toEqual({ action: "drop", reason: "lid_identity_mismatch" });
  });

  it("never resolves LIDs for groups, status, newsletters or broadcasts", async () => {
    const lookup = vi.fn(async (): Promise<LidPhoneRecord[]> => [
      { lid: OWNER_LID, pn: OWNER_CUS },
    ]);
    const resolver = new LidPhoneResolver(lookup);
    const deps = gateDeps({ resolveLidSelfChat: (args) => resolveLidSelfChat(resolver, args) });

    for (const [index, address] of [
      "120363000000000000@g.us",
      "status@broadcast",
      "1234567890@newsletter",
      "1234567890@broadcast",
    ].entries()) {
      const decision = await decideInboundAction(
        envelope({ messageId: `group-${index}`, to: address }, { chatId: address }),
        deps,
      );
      expect(decision).toEqual({ action: "drop", reason: "not_self_chat" });
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it("keeps accepting the classic c.us owner self-chat without any LID lookup", async () => {
    const lookup = vi.fn(async (): Promise<LidPhoneRecord[]> => []);
    const resolver = new LidPhoneResolver(lookup);
    const decision = await decideInboundAction(
      envelope({ to: OWNER_CUS }, { chatId: OWNER_CUS }),
      gateDeps({ resolveLidSelfChat: (args) => resolveLidSelfChat(resolver, args) }),
    );
    expect(decision).toEqual({ action: "accept" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects inbound messages from other contacts", async () => {
    const decision = await decideInboundAction(
      envelope({ fromMe: false, from: OTHER_CUS, to: OWNER_CUS }, { chatId: OTHER_CUS }),
      gateDeps(),
    );
    expect(decision).toEqual({ action: "drop", reason: "not_self_chat" });
  });
});

describe("inbound gate - duplicate, echo and replay protection", () => {
  it("executes once when WhatsApp delivers both message and message_create", async () => {
    const deps = gateDeps();
    const first = await decideInboundAction(envelope(), deps);
    const second = await decideInboundAction(envelope(), deps);

    expect(first).toEqual({ action: "accept" });
    expect(second).toEqual({ action: "drop", reason: "duplicate_event" });
  });

  it("blocks the bot's own outgoing reply echo", async () => {
    const echoGuard = new WhatsAppEchoGuard();
    echoGuard.rememberOutgoing("Ready when you are");
    const decision = await decideInboundAction(
      envelope({ body: "Ready when you are" }),
      gateDeps({ echoGuard }),
    );
    expect(decision).toEqual({ action: "drop", reason: "bot_echo" });
  });

  it("drops startup replay before doing any chat or identity lookup", async () => {
    const readChatIdentity = vi.fn(async (): Promise<InboundChatIdentity> => ({
      chatId: "",
      chatIsMe: false,
    }));
    const decision = await decideInboundAction(
      envelope({ timestampSeconds: 10, readChatIdentity }),
      gateDeps({ acceptMessagesAfterMs: 60_000 }),
    );
    expect(decision).toEqual({ action: "drop", reason: "startup_replay" });
    expect(readChatIdentity).not.toHaveBeenCalled();
  });
});
