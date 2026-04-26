import { describe, expect, it } from "vitest";
import { MockWhatsAppClient } from "../src/whatsapp/mock.js";

describe("MockWhatsAppClient", () => {
  it("records sends", async () => {
    const c = new MockWhatsAppClient();
    await c.send({ to: "1", body: "hi" });
    expect(c.sent).toHaveLength(1);
    expect(c.sent[0]).toMatchObject({ to: "1", body: "hi" });
  });

  it("dispatches inbound to handlers", async () => {
    const c = new MockWhatsAppClient();
    const seen: string[] = [];
    c.onMessage(async (m) => seen.push(m.body));
    await c.inject({ from: "1", body: "hello" });
    await c.inject({ from: "1", body: "world" });
    expect(seen).toEqual(["hello", "world"]);
  });

  it("destroy stops sends", async () => {
    const c = new MockWhatsAppClient();
    await c.destroy();
    await expect(c.send({ to: "1", body: "x" })).rejects.toThrow(/destroyed/);
  });

  it("reset clears state", async () => {
    const c = new MockWhatsAppClient();
    await c.send({ to: "1", body: "x" });
    c.reset();
    expect(c.sent).toEqual([]);
  });
});
