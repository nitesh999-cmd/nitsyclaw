import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WAWebJS from "whatsapp-web.js";

import { WwebjsClient } from "./wwebjs-client.js";
import type { InboundMessage } from "./adapters.js";

// Synthetic throughout. No real number, message id or media appears here.
const OWNER = "61400000000";
const OWNER_JID = `${OWNER}@c.us`;
const SERIALIZED = `true_${OWNER_JID}_3EB0AAAAAAAAAAAAAAAA`;

// The shape the live probe reported for an inbound image on 2026-09-09:
// _serialized absent, $1 a string.
const RENAMED_ID = {
  $1: SERIALIZED,
  fromMe: true,
  id: "3EB0AAAAAAAAAAAAAAAA",
  remote: OWNER_JID,
  self: "out",
};

const sessionDirs: string[] = [];

afterEach(() => {
  for (const dir of sessionDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * Drives the real WwebjsClient inbound path: the genuine handler registered by
 * wireEvents(), the genuine self-chat gate, and a genuine whatsapp-web.js
 * Message whose page boundary is mocked so we can see the id it would send.
 */
async function captureInboundForMediaMessage(): Promise<{
  inbound: InboundMessage;
  evaluated: unknown[];
  client: WwebjsClient;
}> {
  const sessionDir = mkdtempSync(join(tmpdir(), "wwebjs-inbound-"));
  sessionDirs.push(sessionDir);

  const evaluated: unknown[] = [];
  const pageClient = {
    pupPage: {
      evaluate: async (_fn: unknown, msgId: unknown) => {
        evaluated.push(msgId);
        return { data: "AAAA", mimetype: "image/jpeg", filename: null, filesize: 3 };
      },
    },
  };

  const message = new WAWebJS.Message(pageClient, {
    id: { ...RENAMED_ID },
    directPath: "/v/t62.0-24/synthetic_direct_path",
    type: "image",
    t: Math.floor(Date.now() / 1000),
  }) as unknown as Record<string, unknown>;
  message.fromMe = true;
  message.from = OWNER_JID;
  message.to = OWNER_JID;
  message.timestamp = Math.floor(Date.now() / 1000);
  message.body = "";
  message.getChat = async () => ({
    id: { _serialized: OWNER_JID },
    getContact: async () => ({ isMe: true }),
  });

  const client = new WwebjsClient({ sessionDir, ownerNumber: OWNER });
  const internals = client as unknown as { client: unknown; generation: number };
  const emitter = new EventEmitter();
  internals.client = emitter;
  (client as unknown as { wireEvents(generation: number): void }).wireEvents(internals.generation);

  const received = new Promise<InboundMessage>((resolve, reject) => {
    client.onMessage((m) => resolve(m));
    setTimeout(() => reject(new Error("inbound handler did not deliver a message")), 10_000);
  });

  emitter.emit("message", message);
  const inbound = await received;
  return { inbound, evaluated, client };
}

describe("inbound media handler repairs the message id before the library reads it", () => {
  it("accepts a $1-only media message and exposes the resolved id", async () => {
    const { inbound } = await captureInboundForMediaMessage();

    expect(inbound.hasMedia).toBe(true);
    expect(inbound.mediaType).toBe("image");
    // The application-facing read resolves through $1.
    expect(inbound.id).toBe(SERIALIZED);
  });

  // The load-bearing assertion. downloadMedia() reads this.id._serialized off
  // the message object itself, so the only way SERIALIZED reaches page.evaluate
  // is the handler's ensureSerializedMessageId(m) call. Remove that call and
  // the library sends undefined, and this fails.
  it("sends the repaired id into the page.evaluate boundary", async () => {
    const { inbound, evaluated } = await captureInboundForMediaMessage();

    expect(evaluated).toEqual([]);
    await inbound.downloadMedia?.();

    expect(evaluated).toEqual([SERIALIZED]);
    expect(evaluated[0]).not.toBeUndefined();
  });

  it("returns the decoded media to the caller", async () => {
    const { inbound } = await captureInboundForMediaMessage();
    const media = await inbound.downloadMedia?.();

    expect(media?.mimetype).toBe("image/jpeg");
    expect(media?.data).toBeInstanceOf(Buffer);
  });

  // A resolved download with no media is a failure, not a success.
  it("treats a resolved-but-empty download as a failure", async () => {
    const sessionDir = mkdtempSync(join(tmpdir(), "wwebjs-inbound-empty-"));
    sessionDirs.push(sessionDir);

    const message = new WAWebJS.Message(
      { pupPage: { evaluate: async () => null } },
      {
        id: { ...RENAMED_ID },
        directPath: "/v/t62.0-24/synthetic_direct_path",
        type: "image",
        t: Math.floor(Date.now() / 1000),
      },
    ) as unknown as Record<string, unknown>;
    message.fromMe = true;
    message.from = OWNER_JID;
    message.to = OWNER_JID;
    message.timestamp = Math.floor(Date.now() / 1000);
    message.body = "";
    message.getChat = async () => ({
      id: { _serialized: OWNER_JID },
      getContact: async () => ({ isMe: true }),
    });

    const client = new WwebjsClient({ sessionDir, ownerNumber: OWNER });
    const internals = client as unknown as { client: unknown; generation: number };
    const emitter = new EventEmitter();
    internals.client = emitter;
    (client as unknown as { wireEvents(generation: number): void }).wireEvents(internals.generation);

    const received = new Promise<InboundMessage>((resolve, reject) => {
      client.onMessage((m) => resolve(m));
      setTimeout(() => reject(new Error("inbound handler did not deliver a message")), 10_000);
    });
    emitter.emit("message", message);
    const inbound = await received;

    await expect(inbound.downloadMedia?.()).rejects.toThrow(/no media/i);
  });
});
