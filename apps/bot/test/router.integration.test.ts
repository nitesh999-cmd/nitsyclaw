// Integration tests for the inbound message router.
// Exercises the full path: WhatsApp inbound -> router -> agent loop -> tool -> WhatsApp outbound.
// All deps are fakes; no network.

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { Router } from "../src/router.js";
import {
  makeAgentDeps,
  fakeLlmWithToolCall,
  fakeImageAnalyzer,
  fakeTranscriber,
} from "@nitsyclaw/shared/../test/helpers.js";
import { MockWhatsAppClient } from "@nitsyclaw/shared/whatsapp";
import { generateKey } from "@nitsyclaw/shared/utils";

const OWNER = "+919876543210";

describe("Router (integration)", () => {
  let wa: MockWhatsAppClient;
  let deps: ReturnType<typeof makeAgentDeps>;
  let router: Router;
  let oldEncryptionKey: string | undefined;

  beforeEach(() => {
    oldEncryptionKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = generateKey();
    wa = new MockWhatsAppClient();
    deps = makeAgentDeps({
      whatsapp: wa,
      llm: fakeLlmWithToolCall("reply_to_user", { text: "ack" }),
    });
    router = new Router(deps, OWNER);
  });

  afterEach(() => {
    if (oldEncryptionKey) process.env.ENCRYPTION_KEY = oldEncryptionKey;
    else delete process.env.ENCRYPTION_KEY;
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

  it("requires confirmation id before resolving pending email draft approval", async () => {
    const state = (deps.db as any).__state;
    state.confirmations.push({
      id: "05608bae-9152-43ea-bec9-df3a8c6b4c72",
      action: "email_create_draft",
      payload: {
        provider: "gmail",
        to: ["nitesh@example.com"],
        subject: "Hi",
        body: "Private body",
      },
      status: "pending",
      expiresAt: new Date("2026-05-03T14:00:00Z"),
      createdAt: new Date("2026-05-03T13:00:00Z"),
    });

    await router.handle({
      id: "x",
      from: OWNER,
      body: "yes",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent.some((m) => m.body.includes("Email drafts need the confirmation id"))).toBe(true);
    expect(state.confirmations[0].status).toBe("pending");
  });

  it("resolves pending email draft when confirmation id is included", async () => {
    const state = (deps.db as any).__state;
    state.confirmations.push({
      id: "05608bae-9152-43ea-bec9-df3a8c6b4c72",
      action: "email_create_draft",
      payload: {
        provider: "gmail",
        to: ["nitesh@example.com"],
        subject: "Hi",
        body: "Private body",
      },
      status: "pending",
      expiresAt: new Date("2026-05-03T14:00:00Z"),
      createdAt: new Date("2026-05-03T13:00:00Z"),
    });

    await router.handle({
      id: "x",
      from: OWNER,
      body: "yes 05608bae-9152-43ea-bec9-df3a8c6b4c72",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent.some((m) => m.body.includes("Email draft not created yet"))).toBe(true);
    expect(state.confirmations[0].status).toBe("pending");
  });

  it("build status previews the pending queue without running the notifier", async () => {
    const state = (deps.db as any).__state;
    state.feature_requests.push({
      id: "05608bae-9152-43ea-bec9-df3a8c6b4c72",
      description: "Add Google Photos search",
      type: "feature",
      size: "M",
      status: "pending",
      source: "whatsapp",
      createdAt: new Date("2026-04-28T17:00:00Z"),
    });

    await router.handle({
      id: "x",
      from: OWNER,
      body: "build status",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent.some((m) => m.body.includes("Build queue preview (1 pending)"))).toBe(true);
    expect(wa.sent.some((m) => m.body.includes("Add Google Photos search"))).toBe(true);
  });

  it("run build triggers the local build-agent notification summary", async () => {
    const state = (deps.db as any).__state;
    state.feature_requests.push({
      id: "05608bae-9152-43ea-bec9-df3a8c6b4c72",
      description: "Add Google Photos search",
      type: "feature",
      size: "M",
      status: "pending",
      source: "whatsapp",
      createdAt: new Date("2026-04-28T17:00:00Z"),
    });

    await router.handle({
      id: "x",
      from: OWNER,
      body: "run build",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent.some((m) => m.body.includes("Build agent checked 1 pending"))).toBe(true);
    expect(wa.sent.some((m) => m.body.includes("Implementation still happens in Claude Code"))).toBe(true);
    expect(wa.sent.some((m) => m.body.includes("Add Google Photos search"))).toBe(true);
  });

  it("run build reports an empty queue without calling the notifier", async () => {
    await router.handle({
      id: "x",
      from: OWNER,
      body: "run build",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent).toHaveLength(1);
    expect(wa.sent[0].body).toBe("Build agent checked the queue. No pending features or bugs.");
  });
});
