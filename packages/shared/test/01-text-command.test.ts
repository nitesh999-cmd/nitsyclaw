import { describe, expect, it } from "vitest";
import { classifyTextCommand, registerTextCommand } from "../src/features/01-text-command.js";
import { ToolRegistry } from "../src/agent/tools.js";
import { makeAgentDeps } from "./helpers.js";
import { MockWhatsAppClient } from "../src/whatsapp/mock.js";

describe("classifyTextCommand", () => {
  it("returns intent + body", () => {
    expect(classifyTextCommand("remind me to drink water")).toEqual({
      intent: "set_reminder",
      body: "remind me to drink water",
    });
  });
});

describe("reply_to_user tool", () => {
  it("sends text via WhatsApp client", async () => {
    const r = new ToolRegistry();
    registerTextCommand(r);
    const wa = new MockWhatsAppClient();
    const deps = makeAgentDeps({ whatsapp: wa });
    const tool = r.get("reply_to_user")!;
    await tool.handler(
      { text: "hello back" },
      { userPhone: "+9100", now: new Date(), timezone: "UTC", deps },
    );
    expect(wa.sent[0]).toMatchObject({ to: "+9100", body: "hello back" });
  });
});
