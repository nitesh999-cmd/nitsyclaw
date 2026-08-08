import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("apps/bot/src/whatsapp-owner-ack-test.ts"), "utf8");

describe("owner-only live ACK test guard", () => {
  it("requires explicit one-send approval and has no recipient argument", () => {
    expect(source).toContain("--approve-one-owner-send");
    expect(source).not.toContain("--recipient");
    expect(source).toMatch(/target = env\.WHATSAPP_OWNER_NUMBER/);
  });

  it("submits exactly once through the durable ACK coordinator", () => {
    expect(source.match(/coordinator\.submit\(/g)).toHaveLength(1);
    expect(source).toContain("WhatsAppHeartbeatAckStateStore");
    expect(source).toContain("CONDITIONAL owner-only result");
  });
});
