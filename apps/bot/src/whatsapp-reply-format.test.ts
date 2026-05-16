import { describe, expect, it } from "vitest";
import { formatWhatsAppReplyShape, whatsappReplyMetrics } from "./whatsapp-reply-format.js";

describe("WhatsApp reply format", () => {
  it("keeps answer, state, details, and next action in a stable order", () => {
    const reply = formatWhatsAppReplyShape({
      answer: "Status: ready",
      state: "State: checked local tools.",
      details: ["Detail one", "Detail two"],
      next: "proof test",
    });

    expect(reply.split("\n")).toEqual([
      "Status: ready",
      "State: checked local tools.",
      "Detail one",
      "Detail two",
      "Next: proof test",
    ]);
    expect(whatsappReplyMetrics(reply)).toEqual({ lines: 5, chars: reply.length });
  });
});
