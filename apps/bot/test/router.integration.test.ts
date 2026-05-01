// Integration tests for the inbound message router.
// Exercises the full path: WhatsApp inbound -> router -> agent loop -> tool -> WhatsApp outbound.
// All deps are fakes; no network.

import { describe, expect, it, beforeEach } from "vitest";
import { Router } from "../src/router.js";
import {
  makeAgentDeps,
  fakeLlmWithToolCall,
  makeFakeDb,
  fakeImageAnalyzer,
  fakeTranscriber,
} from "@nitsyclaw/shared/../test/helpers.js";
import { MockWhatsAppClient } from "@nitsyclaw/shared/whatsapp";

const OWNER = "+919876543210";

describe("Router (integration)", () => {
  let wa: MockWhatsAppClient;
  let deps: ReturnType<typeof makeAgentDeps>;
  let router: Router;

  beforeEach(() => {
    wa = new MockWhatsAppClient();
    deps = makeAgentDeps({
      whatsapp: wa,
      llm: fakeLlmWithToolCall("reply_to_user", { text: "ack" }),
    });
    router = new Router(deps, OWNER);
  });

  it("drops messages from non-owners (R2)", async () => {
    await router.handle({
      id: "x",
      from: "+91-stranger",
      body: "hi",
      timestamp: new Date(),
      hasMedia: false,
    });
    expect(wa.sent).toHaveLength(0);
  });

  it("text message → agent loop → reply", async () => {
    await router.handle({
      id: "x",
      from: OWNER,
      body: "hello",
      timestamp: new Date(),
      hasMedia: false,
    });
    // reply_to_user tool sends "ack"
    expect(wa.sent.find((m) => m.body === "ack")).toBeTruthy();
  });

  it("voice note → transcribed and acknowledged", async () => {
    deps = makeAgentDeps({
      whatsapp: wa,
      transcriber: fakeTranscriber,
      llm: fakeLlmWithToolCall("reply_to_user", { text: "got it" }),
    });
    router = new Router(deps, OWNER);
    await router.handle({
      id: "x",
      from: OWNER,
      body: "",
      timestamp: new Date(),
      hasMedia: true,
      mediaType: "voice",
      downloadMedia: async () => ({ data: Buffer.from("audio"), mimetype: "audio/ogg" }),
    });
    expect(wa.sent.some((m) => m.body.includes("Transcribed"))).toBe(true);
  });

  it("receipt image → expense logged + ack", async () => {
    deps = makeAgentDeps({ whatsapp: wa, imageAnalyzer: fakeImageAnalyzer });
    router = new Router(deps, OWNER);
    await router.handle({
      id: "x",
      from: OWNER,
      body: "",
      timestamp: new Date(),
      hasMedia: true,
      mediaType: "image",
      downloadMedia: async () => ({ data: Buffer.from("img"), mimetype: "image/jpeg" }),
    });
    expect(wa.sent[0].body).toMatch(/Logged INR 250/);
  });

  it("'yes' reply with no pending falls through to the agent", async () => {
    await router.handle({
      id: "x",
      from: OWNER,
      body: "yes",
      timestamp: new Date(),
      hasMedia: false,
    });
    expect(wa.sent.find((m) => m.body === "ack")).toBeTruthy();
  });
});
