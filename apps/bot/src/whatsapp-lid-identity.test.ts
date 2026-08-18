import { describe, expect, it, vi } from "vitest";
import {
  LidPhoneResolver,
  lidSelfChatTargets,
  resolveLidSelfChat,
  type LidPhoneRecord,
} from "./whatsapp-lid-identity.js";

const OWNER = "+61430008008";
const OWNER_LID = "129274421981381@lid";
const OTHER_LID = "884477221100993@lid";

function lookupFrom(map: Record<string, string>) {
  return vi.fn(async (userIds: string[]): Promise<LidPhoneRecord[]> =>
    userIds.map((id) => ({ lid: id, pn: map[id] ?? null })),
  );
}

describe("lidSelfChatTargets", () => {
  it("treats the live regression envelope as a LID self-chat candidate", () => {
    expect(
      lidSelfChatTargets({
        fromMe: true,
        from: "61430008008@c.us",
        to: OWNER_LID,
        chatId: "",
        ownerNumber: OWNER,
      }),
    ).toEqual([OWNER_LID]);
  });

  it("requires both endpoints when the sender is also a LID", () => {
    expect(
      lidSelfChatTargets({
        fromMe: true,
        from: OTHER_LID,
        to: OWNER_LID,
        chatId: "",
        ownerNumber: OWNER,
      }),
    ).toEqual([OWNER_LID, OTHER_LID]);
  });

  it("is not a candidate for inbound, group, status, newsletter or broadcast traffic", () => {
    const base = { from: "61430008008@c.us", to: OWNER_LID, chatId: "", ownerNumber: OWNER };
    expect(lidSelfChatTargets({ ...base, fromMe: false })).toBeNull();
    expect(
      lidSelfChatTargets({ ...base, fromMe: true, to: "120363000000000000@g.us" }),
    ).toBeNull();
    expect(
      lidSelfChatTargets({ ...base, fromMe: true, chatId: "120363000000000000@g.us" }),
    ).toBeNull();
    expect(lidSelfChatTargets({ ...base, fromMe: true, from: "status@broadcast" })).toBeNull();
    expect(lidSelfChatTargets({ ...base, fromMe: true, to: "1234@newsletter" })).toBeNull();
    expect(lidSelfChatTargets({ ...base, fromMe: true, to: "1234@broadcast" })).toBeNull();
  });

  it("is not a candidate without a LID endpoint or with a known non-LID chat", () => {
    expect(
      lidSelfChatTargets({
        fromMe: true,
        from: "61430008008@c.us",
        to: "61425046161@c.us",
        chatId: "",
        ownerNumber: OWNER,
      }),
    ).toBeNull();
    expect(
      lidSelfChatTargets({
        fromMe: true,
        from: "61430008008@c.us",
        to: OWNER_LID,
        chatId: "61425046161@c.us",
        ownerNumber: OWNER,
      }),
    ).toBeNull();
  });

  it("is not a candidate when a plain sender id is somebody else", () => {
    expect(
      lidSelfChatTargets({
        fromMe: true,
        from: "61425046161@c.us",
        to: OWNER_LID,
        chatId: "",
        ownerNumber: OWNER,
      }),
    ).toBeNull();
  });
});

describe("LidPhoneResolver", () => {
  it("resolves a LID to phone digits and caches the answer", async () => {
    const lookup = lookupFrom({ [OWNER_LID]: "61430008008@c.us" });
    const resolver = new LidPhoneResolver(lookup);

    expect(await resolver.resolvePhone(OWNER_LID)).toBe("61430008008");
    expect(await resolver.resolvePhone(OWNER_LID)).toBe("61430008008");
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("expires cached mappings so a stale entry cannot keep granting access", async () => {
    let nowMs = 1_000;
    const lookup = vi
      .fn<(userIds: string[]) => Promise<LidPhoneRecord[]>>()
      .mockResolvedValueOnce([{ lid: OWNER_LID, pn: "61430008008@c.us" }])
      .mockResolvedValueOnce([{ lid: OWNER_LID, pn: "61425046161@c.us" }]);
    const resolver = new LidPhoneResolver(lookup, { ttlMs: 1_000, now: () => nowMs });

    expect(await resolver.resolvePhone(OWNER_LID)).toBe("61430008008");
    nowMs += 1_001;
    expect(await resolver.resolvePhone(OWNER_LID)).toBe("61425046161");
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("bounds the cache", async () => {
    const resolver = new LidPhoneResolver(
      async (userIds) => userIds.map((id) => ({ lid: id, pn: `6142504${id.slice(0, 4)}` })),
      { maxEntries: 3 },
    );

    for (let i = 0; i < 10; i += 1) {
      await resolver.resolvePhone(`10000000000000${i}@lid`);
    }

    expect(resolver.cacheSize).toBe(3);
  });

  it("fails closed on lookup errors, empty results and malformed payloads", async () => {
    const throwing = new LidPhoneResolver(async () => {
      throw new Error("puppeteer evaluate failed");
    });
    expect(await throwing.resolvePhone(OWNER_LID)).toBe("");

    const empty = new LidPhoneResolver(async () => []);
    expect(await empty.resolvePhone(OWNER_LID)).toBe("");

    const undefinedResult = new LidPhoneResolver(async () => undefined);
    expect(await undefinedResult.resolvePhone(OWNER_LID)).toBe("");

    const missingPhone = new LidPhoneResolver(async () => [{ lid: OWNER_LID, pn: null }]);
    expect(await missingPhone.resolvePhone(OWNER_LID)).toBe("");

    const mismatchedLid = new LidPhoneResolver(async () => [
      { lid: OTHER_LID, pn: "61430008008@c.us" },
    ]);
    expect(await mismatchedLid.resolvePhone(OWNER_LID)).toBe("");
  });

  it("never resolves non-LID addresses", async () => {
    const lookup = lookupFrom({ "61430008008@c.us": "61430008008@c.us" });
    const resolver = new LidPhoneResolver(lookup);

    expect(await resolver.resolvePhone("61430008008@c.us")).toBe("");
    expect(await resolver.resolvePhone("")).toBe("");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("does not cache failures as acceptances", async () => {
    const lookup = vi
      .fn<(userIds: string[]) => Promise<LidPhoneRecord[]>>()
      .mockResolvedValueOnce([{ lid: OWNER_LID, pn: null }])
      .mockResolvedValueOnce([{ lid: OWNER_LID, pn: "61430008008@c.us" }]);
    const resolver = new LidPhoneResolver(lookup);

    expect(await resolver.resolvePhone(OWNER_LID)).toBe("");
    expect(await resolver.resolvePhone(OWNER_LID)).toBe("61430008008");
  });
});

describe("resolveLidSelfChat", () => {
  const envelope = {
    fromMe: true,
    from: "61430008008@c.us",
    to: OWNER_LID,
    chatId: "",
    ownerNumber: OWNER,
  };

  it("accepts only when the LID resolves to the owner number", async () => {
    const resolver = new LidPhoneResolver(lookupFrom({ [OWNER_LID]: "61430008008@c.us" }));
    expect(await resolveLidSelfChat(resolver, envelope)).toBe("accepted");
  });

  it("rejects when the same envelope resolves to somebody else", async () => {
    const resolver = new LidPhoneResolver(lookupFrom({ [OWNER_LID]: "61425046161@c.us" }));
    expect(await resolveLidSelfChat(resolver, envelope)).toBe("rejected_identity");
  });

  it("reports unresolved when the LID cannot be mapped", async () => {
    const resolver = new LidPhoneResolver(async () => []);
    expect(await resolveLidSelfChat(resolver, envelope)).toBe("unresolved");
  });

  it("rejects when one of two LID endpoints is somebody else", async () => {
    const resolver = new LidPhoneResolver(
      lookupFrom({ [OWNER_LID]: "61430008008@c.us", [OTHER_LID]: "61425046161@c.us" }),
    );
    expect(
      await resolveLidSelfChat(resolver, { ...envelope, from: OTHER_LID }),
    ).toBe("rejected_identity");
  });

  it("does not classify non-candidates", async () => {
    const resolver = new LidPhoneResolver(lookupFrom({ [OWNER_LID]: "61430008008@c.us" }));
    expect(
      await resolveLidSelfChat(resolver, { ...envelope, to: "61425046161@c.us" }),
    ).toBe("not_candidate");
  });
});
