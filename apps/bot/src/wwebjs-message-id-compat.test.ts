import { describe, expect, it } from "vitest";
import WAWebJS from "whatsapp-web.js";

import { ensureSerializedMessageId, resolveSerializedMessageId } from "./wwebjs-client.js";

// Shapes here mirror what the live probe reported on 2026-09-09:
//   id.keys=[$1,fromMe,id,remote,self] _serialized=undefined $1=string(61)
// Values are synthetic; no real number or message id appears in this file.
const SERIALIZED = "true_61400000000@c.us_3EB0AAAAAAAAAAAAAAAA";
const LEGACY_ID = { _serialized: SERIALIZED, fromMe: true, remote: "61400000000@c.us" };
const RENAMED_ID = { $1: SERIALIZED, fromMe: true, id: "3EB0AAAAAAAAAAAAAAAA", remote: "61400000000@c.us", self: "out" };

describe("resolveSerializedMessageId", () => {
  it("returns the existing _serialized value unchanged", () => {
    expect(resolveSerializedMessageId(LEGACY_ID)).toBe(SERIALIZED);
  });

  it("prefers _serialized over $1 when both are present and differ", () => {
    const both = { _serialized: SERIALIZED, $1: "false_61499999999@c.us_DIFFERENT" };
    expect(resolveSerializedMessageId(both)).toBe(SERIALIZED);
  });

  it("falls back to $1 for the observed renamed shape", () => {
    expect(resolveSerializedMessageId(RENAMED_ID)).toBe(SERIALIZED);
  });

  it("accepts a group message id carrying a participant suffix", () => {
    const groupId = { $1: "false_61400000000-1600000000@g.us_3EB0BBBB_61411111111@c.us" };
    expect(resolveSerializedMessageId(groupId)).toBe(groupId.$1);
  });

  it.each([
    ["absent id", undefined],
    ["null id", null],
    ["non-object id", "true_61400000000@c.us_3EB0"],
    ["empty object", {}],
    ["empty _serialized with no $1", { _serialized: "" }],
    ["non-string $1", { $1: 12345 }],
    ["empty $1", { $1: "" }],
    ["whitespace $1", { $1: "   " }],
  ])("returns undefined for %s", (_label, id) => {
    expect(resolveSerializedMessageId(id)).toBeUndefined();
  });

  // The guard that stops this becoming a blanket rename: other WhatsApp
  // identifier objects also carry $1, and none of them is a message id.
  it.each([
    ["a chat id", { $1: "61400000000@c.us" }],
    ["a group chat id", { $1: "61400000000-1600000000@g.us" }],
    ["a lid contact id", { $1: "123456789@lid" }],
    ["a bare token", { $1: "3EB0AAAAAAAAAAAAAAAA" }],
    ["a fromMe-less serialized-looking value", { $1: "maybe_61400000000@c.us_3EB0" }],
  ])("refuses %s", (_label, id) => {
    expect(resolveSerializedMessageId(id)).toBeUndefined();
  });
});

describe("ensureSerializedMessageId", () => {
  it("backfills _serialized from $1 and reports the repair", () => {
    const message = { id: { ...RENAMED_ID } };
    expect(ensureSerializedMessageId(message)).toBe(true);
    expect(message.id._serialized).toBe(SERIALIZED);
  });

  it("leaves an existing _serialized untouched and reports no repair", () => {
    const message = { id: { ...LEGACY_ID } };
    expect(ensureSerializedMessageId(message)).toBe(false);
    expect(message.id._serialized).toBe(SERIALIZED);
  });

  it("does not invent a value for an unusable id", () => {
    const message = { id: { $1: "61400000000@c.us" } };
    expect(ensureSerializedMessageId(message)).toBe(false);
    expect("_serialized" in message.id).toBe(false);
  });

  it.each([
    ["a missing message", undefined],
    ["a null message", null],
    ["a message with no id", {}],
    ["a message with a null id", { id: null }],
  ])("returns false for %s without throwing", (_label, message) => {
    expect(ensureSerializedMessageId(message)).toBe(false);
  });

  it("returns false rather than throwing when the id object is frozen", () => {
    const message = { id: Object.freeze({ ...RENAMED_ID }) };
    expect(ensureSerializedMessageId(message)).toBe(false);
  });
});

// The point of the whole fix: whatsapp-web.js reads `this.id._serialized`
// itself, so only a repair written back onto the message object reaches the
// page-evaluation boundary. This exercises the INSTALLED library with the
// browser boundary mocked, so a future library upgrade that changes the
// argument will fail here rather than in production.
describe("downloadMedia page-evaluation boundary (installed whatsapp-web.js)", () => {
  // 1.34.7 derives hasMedia as `Boolean(data.directPath)`, so a media fixture
  // must carry directPath rather than a hasMedia flag.
  const MEDIA_DATA = { directPath: "/v/t62.0-24/synthetic_direct_path", type: "image" };

  const buildClient = () => {
    const evaluated: unknown[] = [];
    const client = {
      pupPage: {
        evaluate: async (_fn: unknown, msgId: unknown) => {
          evaluated.push(msgId);
          return null; // downloadMedia turns a null result into undefined
        },
      },
    };
    return { client, evaluated };
  };

  it("still passes _serialized through for a legacy id", async () => {
    const { client, evaluated } = buildClient();
    const message = new WAWebJS.Message(client, { ...MEDIA_DATA, id: { ...LEGACY_ID } });
    ensureSerializedMessageId(message);
    await message.downloadMedia();
    expect(evaluated).toEqual([SERIALIZED]);
  });

  it("passes the repaired id for the renamed $1 shape", async () => {
    const { client, evaluated } = buildClient();
    const message = new WAWebJS.Message(client, { ...MEDIA_DATA, id: { ...RENAMED_ID } });
    ensureSerializedMessageId(message);
    await message.downloadMedia();
    expect(evaluated).toEqual([SERIALIZED]);
  });

  // Without the repair the library sends undefined into Msg.get(), which is the
  // observed production failure. Pinning it proves the test would catch a
  // regression that removed the repair.
  it("sends undefined without the repair, reproducing the failure", async () => {
    const { client, evaluated } = buildClient();
    const message = new WAWebJS.Message(client, { ...MEDIA_DATA, id: { ...RENAMED_ID } });
    await message.downloadMedia();
    expect(evaluated).toEqual([undefined]);
  });

  it("does not reach the page at all when the message has no media", async () => {
    const { client, evaluated } = buildClient();
    const message = new WAWebJS.Message(client, { id: { ...RENAMED_ID }, type: "chat" });
    ensureSerializedMessageId(message);
    await message.downloadMedia();
    expect(evaluated).toEqual([]);
  });
});
