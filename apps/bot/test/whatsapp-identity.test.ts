import { describe, expect, it } from "vitest";
import { isOwnerSelfChat, normalizeWhatsAppOwnerId } from "../src/whatsapp-identity.js";

describe("WhatsApp identity helpers", () => {
  it("normalizes env phone numbers and WhatsApp c.us ids to digits", () => {
    expect(normalizeWhatsAppOwnerId("+61 430 008 008")).toBe("61430008008");
    expect(normalizeWhatsAppOwnerId("61430008008@c.us")).toBe("61430008008");
  });

  it("accepts owner self-chat when env number includes + but WhatsApp ids do not", () => {
    expect(
      isOwnerSelfChat({
        from: "61430008008@c.us",
        to: "61430008008@c.us",
        ownerNumber: "+61430008008",
      }),
    ).toBe(true);
  });

  it("accepts owner-authored self messages when WhatsApp uses a non-phone sender id", () => {
    expect(
      isOwnerSelfChat({
        from: "129274421981381@lid",
        fromMe: true,
        to: "61430008008@c.us",
        ownerNumber: "+61430008008",
      }),
    ).toBe(true);
  });

  it("rejects non-self chats", () => {
    expect(
      isOwnerSelfChat({
        from: "61430008008@c.us",
        to: "61425046161@c.us",
        ownerNumber: "+61430008008",
      }),
    ).toBe(false);
  });

  it("rejects owner-authored messages sent to other chats", () => {
    expect(
      isOwnerSelfChat({
        from: "129274421981381@lid",
        fromMe: true,
        to: "61425046161@c.us",
        ownerNumber: "+61430008008",
      }),
    ).toBe(false);
  });
});
