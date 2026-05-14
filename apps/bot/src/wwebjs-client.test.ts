import { describe, expect, it } from "vitest";
import { prepareOutboundBodyForWhatsApp } from "./wwebjs-client.js";

describe("prepareOutboundBodyForWhatsApp", () => {
  it.each([
    "Saved. Working on it.",
    "Saved.Working on it.",
    "Working on it.",
    " working on it ",
  ])("suppresses noisy receipt before raw WhatsApp send: %s", (body) => {
    expect(prepareOutboundBodyForWhatsApp(body)).toBe("");
  });

  it("removes noisy receipt lines but keeps the real answer", () => {
    expect(
      prepareOutboundBodyForWhatsApp("Saved. Working on it.\nHey Nitesh! What can I do for you today?"),
    ).toBe("Hey Nitesh! What can I do for you today?");
  });
});
