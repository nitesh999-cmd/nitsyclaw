import { describe, expect, it } from "vitest";
import { searchConversationHistory } from "../src/features/12-whatsapp-history.js";
import { makeAgentDeps } from "./helpers.js";
import { insertMessage } from "../src/db/repo.js";
import { encryptString, hashPhone } from "../src/utils/crypto.js";

describe("conversation history search", () => {
  it("finds saved WhatsApp messages by keyword", async () => {
    const deps = makeAgentDeps();
    const userPhone = "+61430008008";
    await insertMessage(deps.db as any, {
      direction: "in",
      surface: "whatsapp",
      fromNumber: hashPhone(userPhone),
      body: "remember the blue folder for invoices",
    });

    const out = await searchConversationHistory(
      { deps, userPhone, now: deps.now(), timezone: deps.timezone },
      { query: "blue folder" },
    );

    expect(out.count).toBe(1);
    expect(out.items[0]?.snippet).toContain("blue folder");
  });

  it("decrypts encrypted message bodies before matching", async () => {
    const oldKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    try {
      const deps = makeAgentDeps();
      const userPhone = "+61430008008";
      await insertMessage(deps.db as any, {
        direction: "out",
        surface: "whatsapp",
        fromNumber: hashPhone(userPhone),
        body: encryptString("invoice was sent to solarharbour"),
      });

      const out = await searchConversationHistory(
        { deps, userPhone, now: deps.now(), timezone: deps.timezone },
        { query: "solarharbour" },
      );

      expect(out.count).toBe(1);
      expect(out.items[0]?.snippet).toContain("solarharbour");
    } finally {
      if (oldKey) process.env.ENCRYPTION_KEY = oldKey;
      else delete process.env.ENCRYPTION_KEY;
    }
  });
});
