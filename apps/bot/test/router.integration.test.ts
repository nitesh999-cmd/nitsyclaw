// Integration tests for the inbound message router.
// Exercises the full path: WhatsApp inbound -> router -> agent loop -> tool -> WhatsApp outbound.
// All deps are fakes; no network.

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { Router } from "../src/router.js";
import {
  getFakeDbState,
  makeAgentDeps,
  fakeLlmWithToolCall,
  fakeImageAnalyzer,
  fakeTranscriber,
} from "@nitsyclaw/shared/../test/helpers.js";
import { MockWhatsAppClient } from "@nitsyclaw/shared/whatsapp";
import { generateKey, hashPhone } from "@nitsyclaw/shared/utils";

const OWNER = "+919876543210";

describe("Router (integration)", () => {
  let wa: MockWhatsAppClient;
  let deps: ReturnType<typeof makeAgentDeps>;
  let router: Router;
  let oldEncryptionKey: string | undefined;

  function makeSimplePdf(textLines: string[]): Buffer {
    const textOps = textLines
      .map((line, index) => `${index === 0 ? "" : "0 -24 Td\n"}(${line.replace(/[()\\]/g, "\\$&")}) Tj`)
      .join("\n");
    const stream = `BT\n/F1 18 Tf\n72 720 Td\n${textOps}\nET`;
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
      `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((body, index) => {
      offsets.push(Buffer.byteLength(pdf, "utf8"));
      pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xrefOffset = Buffer.byteLength(pdf, "utf8");
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
    pdf += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(pdf, "utf8");
  }

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
    expect(wa.sent.some((m) => m.body === "Saved. Working on it.")).toBe(false);
  });

  it.each(["thanks", "cheers", "got it", "cool", "perfect"])(
    "does not send a working receipt for casual acknowledgement '%s'",
    async (body) => {
      await router.handle({
        id: `x-casual-${body.replace(/\s+/g, "-")}`,
        from: OWNER,
        body,
        timestamp: new Date(),
        hasMedia: false,
      });

      expect(wa.sent.find((m) => m.body === "ack")).toBeTruthy();
      expect(wa.sent.some((m) => m.body === "Saved. Working on it.")).toBe(false);
      expect(wa.sent.some((m) => m.body.includes("What outcome do you want"))).toBe(false);
    },
  );

  it("sanitizes manual Claude Code/nwp instructions from agent replies", async () => {
    deps = makeAgentDeps({
      whatsapp: wa,
      llm: fakeLlmWithToolCall("reply_to_user", {
        text: "Feature queue: 95 pending, 1 shipped.\nRun *nwp in Claude Code to kick off the next build!",
      }),
    });
    router = new Router(deps, OWNER);

    await router.handle({
      id: "x-sanitize",
      from: OWNER,
      body: "summarize the build situation",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent.some((m) => m.body.includes("Feature queue: 95 pending, 1 shipped."))).toBe(true);
    expect(wa.sent.some((m) => m.body.includes("Claude Code"))).toBe(false);
    expect(wa.sent.some((m) => m.body.includes("*nwp"))).toBe(false);
  });

  it("creates a durable command job without sending a noisy receipt before the default agent loop", async () => {
    await router.handle({
      id: "x-job",
      from: OWNER,
      body: "I have a new idea. Build it into NitsyClaw.",
      timestamp: new Date(),
      hasMedia: false,
    });

    const state = getFakeDbState(deps.db);
    expect(state.command_jobs).toHaveLength(1);
    expect(state.command_jobs[0]).toMatchObject({
      source: "whatsapp",
      sourceExternalId: "x-job",
      command: "I have a new idea. Build it into NitsyClaw.",
      status: "done",
      riskLevel: "safe",
    });
    expect(wa.sent.some((m) => m.body === "Saved. Working on it.")).toBe(false);
    expect(wa.sent.some((m) => m.body === "Working on it.")).toBe(false);
    expect(wa.sent.find((m) => m.body === "ack")).toBeTruthy();
  });

  it("suppresses a model-generated saved/working receipt in the default agent loop", async () => {
    deps = makeAgentDeps({
      whatsapp: wa,
      llm: fakeLlmWithToolCall("reply_to_user", { text: "Saved. Working on it." }),
    });
    router = new Router(deps, OWNER);

    await router.handle({
      id: "x-model-receipt",
      from: OWNER,
      body: "Hi",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent).toHaveLength(0);
  });

  it("answers next moves from the live feature queue without the model loop", async () => {
    const state = getFakeDbState(deps.db);
    state.feature_requests.push(
      {
        id: "05608bae-9152-43ea-bec9-df3a8c6b4c72",
        description: "Read and send emails on behalf of the user via Gmail and Outlook",
        type: "feature",
        size: "M",
        status: "pending",
        source: "whatsapp",
        createdAt: new Date("2026-04-28T17:00:00Z"),
      },
      {
        id: "3010d991-9152-43ea-bec9-df3a8c6b4c72",
        description: "Improve dashboard mobile navigation labels",
        type: "feature",
        size: "S",
        status: "pending",
        source: "dashboard",
        createdAt: new Date("2026-04-28T18:00:00Z"),
      },
      {
        id: "36bfc78b-9152-43ea-bec9-df3a8c6b4c72",
        description: "Integration Request Router",
        type: "feature",
        size: "M",
        status: "done",
        source: "whatsapp",
        createdAt: new Date("2026-04-28T16:00:00Z"),
        completedAt: new Date("2026-05-09T00:00:00Z"),
      },
    );

    await router.handle({
      id: "x-next-moves",
      from: OWNER,
      body: "next moves",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("Feature queue: 2 pending");
    expect(wa.sent[0].body).toContain("Best safe next:");
    expect(wa.sent[0].body).toContain("Improve dashboard mobile navigation labels");
    expect(wa.sent[0].body).toContain("Needs setup before live action:");
    expect(wa.sent[0].body.split("\n").length).toBeLessThanOrEqual(9);
    expect(wa.sent[0].body.length).toBeLessThanOrEqual(900);
    expect(wa.sent[0].body).not.toContain("Claude Code");
    expect(wa.sent[0].body).not.toContain("*nwp");
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("appends live feature queue status when a normal question also asks what is pending", async () => {
    deps = makeAgentDeps({
      whatsapp: wa,
      llm: fakeLlmWithToolCall("reply_to_user", { text: "Weather answer from the model." }),
    });
    router = new Router(deps, OWNER);
    const state = getFakeDbState(deps.db);
    state.feature_requests.push(
      {
        id: "05608bae-9152-43ea-bec9-df3a8c6b4c72",
        description: "Read and send emails on behalf of the user via Gmail and Outlook",
        type: "feature",
        size: "M",
        status: "pending",
        source: "whatsapp",
        createdAt: new Date("2026-04-28T17:00:00Z"),
      },
      {
        id: "3010d991-9152-43ea-bec9-df3a8c6b4c72",
        description: "Improve dashboard mobile navigation labels",
        type: "feature",
        size: "S",
        status: "pending",
        source: "dashboard",
        createdAt: new Date("2026-04-28T18:00:00Z"),
      },
    );

    await router.handle({
      id: "x-weather-and-queue",
      from: OWNER,
      body: "how's the weather tomorrow and is there any pending features you're still about to add?",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent.some((m) => m.body.includes("Weather answer from the model."))).toBe(true);
    expect(wa.sent.some((m) => m.body.includes("Feature queue: 2 pending"))).toBe(true);
    expect(wa.sent.some((m) => m.body.includes("Improve dashboard mobile navigation labels"))).toBe(true);
    expect(wa.sent.some((m) => m.body.includes("Claude Code"))).toBe(false);
    expect(wa.sent.some((m) => m.body.includes("*nwp"))).toBe(false);
  });

  it("answers weather location status directly", async () => {
    await router.handle({
      id: "x-location-status",
      from: OWNER,
      body: "where am I?",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("Weather/default location");
    expect(wa.sent[0].body).toContain("Melbourne");
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("answers what can you do with a deterministic working-feature list", async () => {
    await router.handle({
      id: "x-help-status",
      from: OWNER,
      body: "what can you do?",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("NitsyClaw menu");
    expect(wa.sent[0].body).toContain("Say what you need");
    expect(wa.sent[0].body).toContain("Try:");
    expect(wa.sent[0].body).toContain("Works now:");
    expect(wa.sent[0].body).toContain("Remind me to call Mukesh tomorrow at 10 am");
    expect(wa.sent[0].body).toContain("Check before send: I am angry about this bill");
    expect(wa.sent[0].body).toContain("Needs setup:");
    expect(wa.sent[0].body).toContain("proof test");
    expect(wa.sent[0].body).toContain("Safety:");
    expect(wa.sent[0].body.split("\n").length).toBeLessThanOrEqual(13);
    expect(wa.sent[0].body.length).toBeLessThanOrEqual(900);
    expect(wa.sent[0].body).not.toContain("Runtime:");
    expect(wa.sent[0].body).not.toContain("Setup snapshot:");
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("answers build-all-pending requests with a truthful setup-aware plan", async () => {
    await router.handle({
      id: "x-build-all-pending",
      from: OWNER,
      body: "build all pending features",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("Pending build plan");
    expect(wa.sent[0].body).toContain("safe local rails");
    expect(wa.sent[0].body).toContain("Live external actions need account/provider setup");
    expect(wa.sent[0].body).toContain("Gmail");
    expect(wa.sent[0].body).toContain("Phone/SMS");
    expect(wa.sent[0].body).not.toContain("Gmail is connected");
    expect(wa.sent[0].body).not.toContain("Bank feeds: connected");
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("answers ready pending setup status without the model loop", async () => {
    const state = getFakeDbState(deps.db);
    state.feature_requests.push(
      {
        id: "3010d991-9152-43ea-bec9-df3a8c6b4c72",
        description: "Improve dashboard mobile navigation labels",
        type: "feature",
        size: "S",
        status: "pending",
        source: "dashboard",
        createdAt: new Date("2026-04-28T18:00:00Z"),
      },
      {
        id: "05608bae-9152-43ea-bec9-df3a8c6b4c72",
        description: "Read and send emails on behalf of the user via Gmail and Outlook",
        type: "feature",
        size: "M",
        status: "pending",
        source: "whatsapp",
        createdAt: new Date("2026-04-28T17:00:00Z"),
      },
      {
        id: "36bfc78b-9152-43ea-bec9-df3a8c6b4c72",
        description: "CSV expense import from WhatsApp",
        type: "feature",
        size: "S",
        status: "done",
        source: "whatsapp",
        createdAt: new Date("2026-05-10T00:00:00Z"),
        completedAt: new Date("2026-05-11T00:00:00Z"),
      },
    );
    state.connected_accounts.push({
      id: "spotify-account-1",
      provider: "spotify",
      ownerHash: hashPhone(OWNER),
      accountLabel: "default",
      accessToken: "encrypted-token",
      scope: "playlist-read-private",
      expiresAt: new Date("2026-05-16T10:00:00Z"),
      metadata: {},
      createdAt: new Date("2026-05-10T00:00:00Z"),
      updatedAt: new Date("2026-05-10T00:00:00Z"),
    });

    await router.handle({
      id: "x-clean-status",
      from: OWNER,
      body: "status",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("Status: ready");
    expect(wa.sent[0].body).toContain("State:");
    expect(wa.sent[0].body).toContain("Ready:");
    expect(wa.sent[0].body).toContain("Setup snapshot");
    expect(wa.sent[0].body).toContain("Ready/partly ready: Spotify");
    expect(wa.sent[0].body).toContain("Pending: 2 item");
    expect(wa.sent[0].body).toContain("Improve dashboard mobile navigation labels");
    expect(wa.sent[0].body).toContain("Needs setup:");
    expect(wa.sent[0].body).toContain("Read and send emails");
    expect(wa.sent[0].body).toContain("Shipped:");
    expect(wa.sent[0].body).toContain("Next:");
    expect(wa.sent[0].body).not.toContain("Runtime:");
    expect(wa.sent[0].body.split("\n").length).toBeLessThanOrEqual(18);
    expect(wa.sent[0].body.length).toBeLessThanOrEqual(1600);
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("answers exact pending items command without the model loop", async () => {
    const state = getFakeDbState(deps.db);
    state.feature_requests.push({
      id: "05608bae-9152-43ea-bec9-df3a8c6b4c72",
      description: "Read and send emails on behalf of the user via Gmail and Outlook",
      type: "feature",
      size: "M",
      status: "pending",
      source: "whatsapp",
      createdAt: new Date("2026-04-28T17:00:00Z"),
    });

    await router.handle({
      id: "x-pending-items-exact",
      from: OWNER,
      body: "pending items",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("Status: ready");
    expect(wa.sent[0].body).toContain("State:");
    expect(wa.sent[0].body).toContain("Pending: 1 item");
    expect(wa.sent[0].body).toContain("Read and send emails");
    expect(wa.sent[0].body).toContain("Needs setup:");
    expect(wa.sent[0].body).toContain("Safety:");
    expect(wa.sent[0].body).toContain("Next:");
    expect(wa.sent[0].body.split("\n").length).toBeLessThanOrEqual(18);
    expect(wa.sent[0].body.length).toBeLessThanOrEqual(1600);
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("answers WhatsApp self-test from safe runtime heartbeats", async () => {
    const state = getFakeDbState(deps.db);
    state.system_heartbeats.push(
      {
        source: "bot-runtime",
        status: "ok",
        lastSeenAt: new Date("2026-04-25T07:59:00Z"),
        metadata: { platform: "railway", commitShort: "abc1234", secret: "must-not-leak" },
      },
      {
        source: "whatsapp-client",
        status: "ok",
        lastSeenAt: new Date("2026-04-25T07:59:00Z"),
        metadata: { state: "READY" },
      },
      {
        source: "whatsapp-send",
        status: "ok",
        lastSeenAt: new Date("2026-04-25T07:59:00Z"),
        metadata: { lastMessageId: "wamid.test" },
      },
      {
        source: "whatsapp-loop-guard",
        status: "ok",
        lastSeenAt: new Date("2026-04-25T07:59:00Z"),
        metadata: { resetAfter: "send burst" },
      },
    );

    await router.handle({
      id: "x-self-test",
      from: OWNER,
      body: "self test",
      timestamp: new Date("2026-04-25T08:00:00Z"),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("Self test: ready");
    expect(wa.sent[0].body).toContain("State:");
    expect(wa.sent[0].body).toContain("router ready");
    expect(wa.sent[0].body).toContain("commit abc1234");
    expect(wa.sent[0].body).toContain("Bot runtime: ok");
    expect(wa.sent[0].body).toContain("WhatsApp client: ok");
    expect(wa.sent[0].body).toContain("WhatsApp send: ok");
    expect(wa.sent[0].body).toContain("Loop guard: ok");
    expect(wa.sent[0].body).toContain("Next: status | proof test | proof details");
    expect(wa.sent[0].body.split("\n").length).toBeLessThanOrEqual(9);
    expect(wa.sent[0].body.length).toBeLessThanOrEqual(700);
    expect(wa.sent[0].body).not.toContain("must-not-leak");
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("answers WhatsApp incident summary without leaking heartbeat secrets", async () => {
    const state = getFakeDbState(deps.db);
    state.system_heartbeats.push(
      {
        source: "whatsapp-client",
        status: "ok",
        lastSeenAt: new Date("2026-04-25T07:59:00Z"),
        metadata: { state: "READY" },
      },
      {
        source: "whatsapp-send",
        status: "fail",
        lastSeenAt: new Date("2026-04-25T07:59:00Z"),
        metadata: { error: "send failed for [redacted]", secret: "must-not-leak" },
      },
      {
        source: "whatsapp-loop-guard",
        status: "cooldown",
        lastSeenAt: new Date("2026-04-25T07:59:00Z"),
        metadata: { reason: "send burst", resetAt: "2026-04-25T08:02:00Z" },
      },
    );
    state.command_jobs.push({
      id: "05608bae-9152-43ea-bec9-df3a8c6b4c72",
      source: "whatsapp",
      ownerHash: "owner",
      command: "send message to John",
      status: "failed",
      riskLevel: "safe",
      receiptText: "Working on it.",
      resultText: null,
      error: "temporary WhatsApp send failure",
      attempts: 3,
      maxAttempts: 3,
      sourceMessageId: null,
      sourceExternalId: "x-failed",
      dedupeKey: "whatsapp:x-failed",
      nextRunAt: null,
      completedAt: null,
      updatedAt: new Date("2026-04-25T07:59:00Z"),
      createdAt: new Date("2026-04-25T07:59:00Z"),
    });

    await router.handle({
      id: "x-incident-summary",
      from: OWNER,
      body: "what went wrong",
      timestamp: new Date("2026-04-25T08:00:00Z"),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("Incident check:");
    expect(wa.sent[0].body).toContain("State:");
    expect(wa.sent[0].body).toContain("WhatsApp send: fail");
    expect(wa.sent[0].body).toContain("Loop guard: cooldown");
    expect(wa.sent[0].body).toContain("send message to John");
    expect(wa.sent[0].body).toContain("resume whatsapp");
    expect(wa.sent[0].body).toContain("Next:");
    expect(wa.sent[0].body.split("\n").length).toBeLessThanOrEqual(8);
    expect(wa.sent[0].body.length).toBeLessThanOrEqual(780);
    expect(wa.sent[0].body).not.toContain("must-not-leak");
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("answers WhatsApp control plane with runtime queue and recovery state", async () => {
    const state = getFakeDbState(deps.db);
    state.system_heartbeats.push(
      {
        source: "bot-runtime",
        status: "ok",
        lastSeenAt: new Date("2026-04-25T07:59:00Z"),
        metadata: { platform: "railway", commitShort: "abc1234", secret: "must-not-leak" },
      },
      {
        source: "whatsapp-client",
        status: "ok",
        lastSeenAt: new Date("2026-04-25T07:59:30Z"),
        metadata: { state: "READY" },
      },
      {
        source: "whatsapp-send",
        status: "ok",
        lastSeenAt: new Date("2026-04-25T07:59:30Z"),
        metadata: { lastMessageId: "wamid.test" },
      },
      {
        source: "whatsapp-loop-guard",
        status: "ok",
        lastSeenAt: new Date("2026-04-25T07:59:30Z"),
        metadata: { recentSendCount: 2 },
      },
      {
        source: "bot-scheduler",
        status: "ok",
        lastSeenAt: new Date("2026-04-25T07:59:30Z"),
        metadata: {},
      },
    );
    state.feature_requests.push({
      id: "ff70fa2b-7e25-4811-8272-a9cc716e4920",
      description: "[WhatsApp] WhatsApp Control Plane: Build a WhatsApp-safe command control plane.",
      type: "feature",
      severity: "P0",
      size: "L",
      source: "dashboard",
      requestedBy: "system",
      status: "pending",
      implementationNotes: null,
      rejectionReason: null,
      prUrl: null,
      dedupeKey: "operator-mission:whatsapp-control-plane",
      completedAt: null,
      createdAt: new Date("2026-04-25T07:55:00Z"),
      updatedAt: new Date("2026-04-25T07:55:00Z"),
    });

    await router.handle({
      id: "x-control-plane",
      from: OWNER,
      body: "whatsapp control plane",
      timestamp: new Date("2026-04-25T08:00:00Z"),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("Control plane: ready");
    expect(wa.sent[0].body).toContain("commit abc1234");
    expect(wa.sent[0].body).toContain("WhatsApp client: ok");
    expect(wa.sent[0].body).toContain("Loop guard: ok");
    expect(wa.sent[0].body).toContain("Scheduler: ok");
    expect(wa.sent[0].body).toContain("Command jobs:");
    expect(wa.sent[0].body).toContain("Queue: 1 pending");
    expect(wa.sent[0].body).toContain("/whatsapp-recovery");
    expect(wa.sent[0].body).toContain("Next: proof test | feature queue | local status");
    expect(wa.sent[0].body.length).toBeLessThanOrEqual(1200);
    expect(wa.sent[0].body).not.toContain("must-not-leak");
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("answers WhatsApp canary test without touching external providers", async () => {
    await router.handle({
      id: "x-canary-test",
      from: OWNER,
      body: "canary test",
      timestamp: new Date("2026-04-25T08:00:00Z"),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("WhatsApp proof: needs attention");
    expect(wa.sent[0].body).toContain("State:");
    expect(wa.sent[0].body).toContain("WA-202604250800");
    expect(wa.sent[0].body).toContain("commit");
    expect(wa.sent[0].body).toContain("Routing: passed");
    expect(wa.sent[0].body).toContain("Delivery: passed");
    expect(wa.sent[0].body).toContain("Database marker: passed");
    expect(wa.sent[0].body).toContain("Loop guard");
    expect(wa.sent[0].body).toContain("Provider setup: not tested here");
    expect(wa.sent[0].body).toContain("Next: what went wrong | proof details");
    expect(wa.sent[0].body.split("\n").length).toBeLessThanOrEqual(12);
    expect(wa.sent[0].body.length).toBeLessThanOrEqual(900);
    expect(getFakeDbState(deps.db).messages.some((message) => message.metadata?.kind === "whatsapp-canary")).toBe(true);
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("answers WhatsApp proof details with the full diagnostic view", async () => {
    await router.handle({
      id: "x-canary-details",
      from: OWNER,
      body: "proof details",
      timestamp: new Date("2026-04-25T08:00:00Z"),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("WhatsApp proof");
    expect(wa.sent[0].body).toContain("Proof: WA-202604250800");
    expect(wa.sent[0].body).toContain("Version: commit");
    expect(wa.sent[0].body).toContain("Inbound/routing: passed");
    expect(wa.sent[0].body).toContain("Outbound delivery: passed");
    expect(wa.sent[0].body).toContain("Database write/read marker passed");
    expect(wa.sent[0].body).toContain("It does not test Gmail");
    expect(wa.sent[0].body).toContain("what went wrong");
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("queues setup-heavy integration requests deterministically before the model loop", async () => {
    await router.handle({
      id: "x-connect-google-photos",
      from: OWNER,
      body: "set up Google Photos search for family pictures",
      timestamp: new Date(),
      hasMedia: false,
    });

    const state = getFakeDbState(deps.db);
    expect(state.feature_requests).toHaveLength(1);
    expect(state.feature_requests[0].description).toContain("Google Photos selected-media request");
    expect(state.feature_requests[0].implementationNotes).toContain("no live external access was claimed");
    expect(wa.sent[0].body).toContain("Setup request saved");
    expect(wa.sent[0].body).toContain("Google Photos");
    expect(wa.sent[0].body).toContain("Needs setup");
    expect(wa.sent[0].body).not.toContain("ack");
  });

  it("prepares SMS drafts deterministically without sending", async () => {
    await router.handle({
      id: "x-draft-sms",
      from: OWNER,
      body: "draft sms to John saying I am running late",
      timestamp: new Date(),
      hasMedia: false,
    });

    const state = getFakeDbState(deps.db);
    expect(state.feature_requests).toHaveLength(0);
    expect(wa.sent[0].body).toContain("SMS draft for John");
    expect(wa.sent[0].body).toContain("I am running late");
    expect(wa.sent[0].body).toContain("NitsyClaw has not sent it");
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("explains the WhatsApp command contract without the model loop", async () => {
    await router.handle({
      id: "x-command-contract",
      from: OWNER,
      body: "command contract",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("WhatsApp command contract");
    expect(wa.sent[0].body).toContain("answered");
    expect(wa.sent[0].body).toContain("needs approval");
    expect(wa.sent[0].body).toContain("needs setup");
    expect(wa.sent[0].body).toContain("blocked for safety");
    expect(wa.sent[0].body).toContain("failed with reason");
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("logs plain text expenses deterministically before the model loop", async () => {
    await router.handle({
      id: "x-text-expense-deterministic",
      from: OWNER,
      body: "I spent $18.40 at Chemist Warehouse for medicine, log it as health.",
      timestamp: new Date("2026-05-14T12:49:00Z"),
      hasMedia: false,
    });

    const state = getFakeDbState(deps.db);
    expect(state.expenses).toHaveLength(1);
    expect(state.expenses[0]).toMatchObject({
      amount: 1840,
      currency: "AUD",
      category: "health",
      merchant: "Chemist Warehouse",
    });
    expect(wa.sent[0].body).toContain("Expense logged");
    expect(wa.sent[0].body).toContain("AUD 18.40");
    expect(wa.sent[0].body).toContain("health");
    expect(wa.sent[0].body).toContain("Currency default is AUD");
    expect(wa.sent[0].body).toContain("No bank connection was used");
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("sets clear WhatsApp reminders deterministically before the model loop", async () => {
    await router.handle({
      id: "x-reminder-deterministic",
      from: OWNER,
      body: "Remind me to call Mukesh tomorrow at 10 am",
      timestamp: new Date("2026-05-14T12:49:00Z"),
      hasMedia: false,
    });

    const state = getFakeDbState(deps.db);
    expect(state.reminders).toHaveLength(1);
    expect(state.reminders[0]?.text).toContain("call Mukesh");
    expect(wa.sent[0].body).toContain("Reminder set");
    expect(wa.sent[0].body).toContain("Saved: NitsyClaw reminders");
    expect(wa.sent[0].body).toContain("Delivery: WhatsApp self-chat");
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("gates risky send-message requests before the model loop", async () => {
    await router.handle({
      id: "x-risky-send-message",
      from: OWNER,
      body: "send a message to Mukesh saying I am running late",
      timestamp: new Date(),
      hasMedia: false,
    });

    const state = getFakeDbState(deps.db);
    expect(state.command_jobs[0]).toMatchObject({
      sourceExternalId: "x-risky-send-message",
      status: "needs_approval",
      riskLevel: "approval_required",
    });
    expect(wa.sent[0].body).toContain("Needs your approval");
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("answers local files reminders expenses and summaries status", async () => {
    await router.handle({
      id: "x-doc-before-status",
      from: OWNER,
      body: "",
      timestamp: new Date("2026-04-24T08:00:00Z"),
      hasMedia: true,
      mediaType: "document",
      downloadMedia: async () => ({
        data: Buffer.from("AGL Energy electricity bill\nAmount due $19.50\nDue date 18 May 2026"),
        mimetype: "text/plain",
        filename: "agl-bill.txt",
      }),
    });

    const state = getFakeDbState(deps.db);
    state.reminders.push({
      id: "reminder-1",
      text: "call dentist",
      fireAt: new Date("2026-04-26T09:00:00Z"),
      rrule: null,
      status: "pending",
      createdAt: new Date("2026-04-25T08:00:00Z"),
    });
    state.expenses.push({
      id: "expense-1",
      amount: 1875,
      currency: "AUD",
      category: "transport",
      merchant: "Uber Trip",
      occurredAt: new Date("2026-04-25T07:00:00Z"),
      createdAt: new Date("2026-04-25T08:00:00Z"),
    });
    wa.sent = [];

    await router.handle({
      id: "x-local-status",
      from: OWNER,
      body: "local status",
      timestamp: new Date("2026-04-25T08:10:00Z"),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("Local status: ready");
    expect(wa.sent[0].body).toContain("State:");
    expect(wa.sent[0].body).toContain("Files:");
    expect(wa.sent[0].body).toContain("agl-bill.txt");
    expect(wa.sent[0].body).toContain("Reminders:");
    expect(wa.sent[0].body).toContain("call dentist");
    expect(wa.sent[0].body).toContain("next is call dentist");
    expect(wa.sent[0].body).toContain("Expenses:");
    expect(wa.sent[0].body).toContain("AUD 18.75");
    expect(wa.sent[0].body).toContain("Latest: Uber Trip AUD 18.75");
    expect(wa.sent[0].body).toContain("No bank feed used");
    expect(wa.sent[0].body).toContain("Summaries");
    expect(wa.sent[0].body).toContain("Next:");
    expect(wa.sent[0].body.split("\n").length).toBeLessThanOrEqual(10);
    expect(wa.sent[0].body.length).toBeLessThanOrEqual(800);
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("answers daily status from local state without the model loop", async () => {
    await router.handle({
      id: "x-doc-before-daily-status",
      from: OWNER,
      body: "",
      timestamp: new Date("2026-04-24T08:00:00Z"),
      hasMedia: true,
      mediaType: "document",
      downloadMedia: async () => ({
        data: Buffer.from("AGL Energy electricity bill\nAmount due $19.50\nDue date 18 May 2026"),
        mimetype: "text/plain",
        filename: "agl-bill.txt",
      }),
    });

    const state = getFakeDbState(deps.db);
    state.reminders.push({
      id: "reminder-1",
      text: "call dentist",
      fireAt: new Date("2026-04-26T09:00:00Z"),
      rrule: null,
      status: "pending",
      createdAt: new Date("2026-04-25T08:00:00Z"),
    });
    state.expenses.push({
      id: "expense-1",
      amount: 1875,
      currency: "AUD",
      category: "transport",
      merchant: "Uber Trip",
      occurredAt: new Date("2026-04-25T07:00:00Z"),
      createdAt: new Date("2026-04-25T08:00:00Z"),
    });
    state.feature_requests.push({
      id: "3010d991-9152-43ea-bec9-df3a8c6b4c72",
      description: "Improve dashboard mobile navigation labels",
      type: "feature",
      size: "S",
      status: "pending",
      source: "dashboard",
      createdAt: new Date("2026-04-28T18:00:00Z"),
    });
    wa.sent = [];

    await router.handle({
      id: "x-daily-status",
      from: OWNER,
      body: "daily status",
      timestamp: new Date("2026-04-25T08:10:00Z"),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("Daily status");
    expect(wa.sent[0].body).toContain("Reminders");
    expect(wa.sent[0].body).toContain("call dentist");
    expect(wa.sent[0].body).toContain("Expenses");
    expect(wa.sent[0].body).toContain("AUD 18.75");
    expect(wa.sent[0].body).toContain("Files");
    expect(wa.sent[0].body).toContain("agl-bill.txt");
    expect(wa.sent[0].body).toContain("Queue");
    expect(wa.sent[0].body).toContain("No external accounts used");
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("sends the manual nightly health report without the model loop", async () => {
    const state = getFakeDbState(deps.db);
    const now = deps.now();
    state.system_heartbeats.push(
      {
        id: "hb-runtime",
        source: "bot-runtime",
        status: "ok",
        lastSeenAt: now,
        metadata: { commitShort: "test123" },
        updatedAt: now,
      },
      {
        id: "hb-scheduler",
        source: "bot-scheduler",
        status: "ok",
        lastSeenAt: now,
        metadata: {},
        updatedAt: now,
      },
      {
        id: "hb-client",
        source: "whatsapp-client",
        status: "ok",
        lastSeenAt: now,
        metadata: {},
        updatedAt: now,
      },
      {
        id: "hb-send",
        source: "whatsapp-send",
        status: "ok",
        lastSeenAt: now,
        metadata: {},
        updatedAt: now,
      },
      {
        id: "hb-loop",
        source: "whatsapp-loop-guard",
        status: "ok",
        lastSeenAt: now,
        metadata: {},
        updatedAt: now,
      },
    );

    await router.handle({
      id: "x-nightly-health-now",
      from: OWNER,
      body: "nightly health now",
      timestamp: now,
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("Nightly WhatsApp health");
    expect(wa.sent[0].body).toContain("Status: ready");
    expect(wa.sent[0].body).toContain("Version: commit test123");
    expect(wa.sent[0].body).toContain("Provider setup is not tested here");
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("explains expense status with AUD default and no bank-feed claim", async () => {
    const state = getFakeDbState(deps.db);
    state.expenses.push({
      id: "expense-status-1",
      amount: 650,
      currency: "AUD",
      category: "health",
      merchant: "Chemist Warehouse",
      occurredAt: new Date("2026-04-25T07:50:00Z"),
      createdAt: new Date("2026-04-25T07:51:00Z"),
    });

    await router.handle({
      id: "x-expense-status",
      from: OWNER,
      body: "expenses",
      timestamp: new Date("2026-04-25T08:00:00Z"),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("Expenses");
    expect(wa.sent[0].body).toContain("This month: AUD 6.50");
    expect(wa.sent[0].body).toContain("Currency: AUD by default");
    expect(wa.sent[0].body).toContain("No live bank feed is connected");
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("answers what can run without Nitesh before the model loop", async () => {
    await router.handle({
      id: "x-autonomous-work",
      from: OWNER,
      body: "what else can you do without me",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("Safe work I can do without you");
    expect(wa.sent[0].body).toContain("Log expenses");
    expect(wa.sent[0].body).toContain("In the repo");
    expect(wa.sent[0].body).toContain("Needs small action from you");
    expect(wa.sent[0].body).toContain("external data needs explicit confirmation");
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("ignores duplicate WhatsApp events with the same message id", async () => {
    const inbound = {
      id: "x-duplicate",
      from: OWNER,
      body: "Research better electricity plans for Melbourne.",
      timestamp: new Date(),
      hasMedia: false,
    };

    await router.handle(inbound);
    await router.handle(inbound);

    const state = getFakeDbState(deps.db);
    expect(state.command_jobs).toHaveLength(1);
    expect(state.command_jobs[0]).toMatchObject({
      sourceExternalId: "x-duplicate",
      dedupeKey: "whatsapp:x-duplicate",
    });
    expect(wa.sent.filter((message) => message.body.includes("Saved"))).toHaveLength(0);
    expect(wa.sent.filter((message) => message.body === "Working on it.")).toHaveLength(0);
    expect(wa.sent.filter((message) => message.body === "ack")).toHaveLength(1);
  });

  it("strips old Saved prefix when replaying an existing approval gate", async () => {
    const state = getFakeDbState(deps.db);
    state.command_jobs.push({
      id: "old-approval-job",
      source: "whatsapp",
      ownerHash: "owner-hash",
      command: "send this message to Mukesh",
      status: "needs_approval",
      riskLevel: "approval_required",
      receiptText: "Saved. Needs your approval before I act.",
      attempts: 0,
      maxAttempts: 3,
      dedupeKey: "whatsapp:x-old-approval",
      sourceExternalId: "x-old-approval",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await router.handle({
      id: "x-old-approval",
      from: OWNER,
      body: "send this message to Mukesh",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent).toHaveLength(1);
    expect(wa.sent[0].body).toBe("Needs your approval before I act.");
  });

  it("ignores replayed WhatsApp events after router restart", async () => {
    const inbound = {
      id: "x-replayed-status",
      from: OWNER,
      body: "status",
      timestamp: new Date(),
      hasMedia: false,
    };

    await router.handle(inbound);
    router = new Router(deps, OWNER);
    await router.handle(inbound);

    const state = getFakeDbState(deps.db);
    expect(state.command_jobs).toHaveLength(1);
    expect(state.command_jobs[0]).toMatchObject({
      sourceExternalId: "x-replayed-status",
      status: "done",
    });
    expect(wa.sent.filter((message) => message.body.includes("Status: ready"))).toHaveLength(1);
  });

  it("retries replayed WhatsApp status after a partial send failure", async () => {
    let sends = 0;
    wa.send = async (message) => {
      sends += 1;
      if (sends === 1) throw new Error("temporary WhatsApp send failure");
      wa.sent.push(message);
      return { id: `mock-${wa.sent.length}` };
    };
    const inbound = {
      id: "x-replayed-status-after-failure",
      from: OWNER,
      body: "status",
      timestamp: new Date(),
      hasMedia: false,
    };

    await router.handle(inbound);
    router = new Router(deps, OWNER);
    await router.handle(inbound);

    const state = getFakeDbState(deps.db);
    expect(state.command_jobs).toHaveLength(1);
    expect(state.command_jobs[0]).toMatchObject({
      sourceExternalId: "x-replayed-status-after-failure",
      status: "done",
    });
    expect(wa.sent.some((message) => message.body.includes("Couldn't load the current status"))).toBe(true);
    expect(wa.sent.filter((message) => message.body.includes("Status: ready"))).toHaveLength(1);
  });

  it("does not replay a resolved confirmation after router restart", async () => {
    const state = getFakeDbState(deps.db);
    state.confirmations.push({
      id: "05608bae-9152-43ea-bec9-df3a8c6b4c72",
      action: "safe_test_action",
      payload: {},
      status: "pending",
      expiresAt: new Date("2026-05-03T14:00:00Z"),
      createdAt: new Date("2026-05-03T13:00:00Z"),
    });
    const inbound = {
      id: "x-replayed-confirmation",
      from: OWNER,
      body: "approved 05608bae-9152-43ea-bec9-df3a8c6b4c72",
      timestamp: new Date(),
      hasMedia: false,
    };

    await router.handle(inbound);
    router = new Router(deps, OWNER);
    await router.handle(inbound);

    expect(state.confirmations[0].status).toBe("approved");
    expect(state.command_jobs).toHaveLength(1);
    expect(state.command_jobs[0]).toMatchObject({
      sourceExternalId: "x-replayed-confirmation",
      status: "done",
    });
    expect(wa.sent.filter((message) => message.body.includes("Confirmation: approved"))).toHaveLength(1);
    expect(wa.sent.some((message) => message.body === "ack")).toBe(false);
  });

  it("does not let a confirmation send failure fall through to the agent on replay", async () => {
    const state = getFakeDbState(deps.db);
    state.confirmations.push({
      id: "05608bae-9152-43ea-bec9-df3a8c6b4c72",
      action: "safe_test_action",
      payload: {},
      status: "pending",
      expiresAt: new Date("2026-05-03T14:00:00Z"),
      createdAt: new Date("2026-05-03T13:00:00Z"),
    });
    let sends = 0;
    wa.send = async (message) => {
      sends += 1;
      if (sends === 1) throw new Error("temporary WhatsApp send failure");
      wa.sent.push(message);
      return { id: `mock-${wa.sent.length}` };
    };
    const inbound = {
      id: "x-confirmation-send-failure",
      from: OWNER,
      body: "approved 05608bae-9152-43ea-bec9-df3a8c6b4c72",
      timestamp: new Date(),
      hasMedia: false,
    };

    await expect(router.handle(inbound)).rejects.toThrow("temporary WhatsApp send failure");
    router = new Router(deps, OWNER);
    await router.handle(inbound);

    expect(state.confirmations[0].status).toBe("approved");
    expect(state.command_jobs).toHaveLength(1);
    expect(state.command_jobs[0]).toMatchObject({
      sourceExternalId: "x-confirmation-send-failure",
      status: "done",
      resultText: "Confirmation: approved",
    });
    expect(wa.sent).toHaveLength(0);
  });

  it("does not rerun terminal failed command jobs on replay", async () => {
    const state = getFakeDbState(deps.db);
    state.command_jobs.push({
      id: "failed-job-1",
      source: "whatsapp",
      ownerHash: "owner-hash",
      command: "Research better electricity plans for Melbourne.",
      status: "failed",
      riskLevel: "safe",
      receiptText: "Working on it.",
      attempts: 3,
      maxAttempts: 3,
      dedupeKey: "whatsapp:x-replayed-failed",
      sourceExternalId: "x-replayed-failed",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await router.handle({
      id: "x-replayed-failed",
      from: OWNER,
      body: "Research better electricity plans for Melbourne.",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent).toHaveLength(0);
    expect(state.command_jobs[0].status).toBe("failed");
    expect(state.command_jobs[0].attempts).toBe(3);
  });

  it("completes command job when feature request shortcut is too short", async () => {
    await router.handle({
      id: "x-short-feature",
      from: OWNER,
      body: "feature request: x",
      timestamp: new Date(),
      hasMedia: false,
    });

    const state = getFakeDbState(deps.db);
    expect(wa.sent[0].body).toContain("description is too short");
    expect(state.command_jobs).toHaveLength(1);
    expect(state.command_jobs[0]).toMatchObject({
      sourceExternalId: "x-short-feature",
      status: "done",
    });
  });

  it("asks for clarification instead of running unclear emotional speech", async () => {
    await router.handle({
      id: "x-clarify",
      from: OWNER,
      body: "I can't deal with this anymore, this is too much",
      timestamp: new Date(),
      hasMedia: false,
    });

    const state = getFakeDbState(deps.db);
    expect(state.command_jobs).toHaveLength(1);
    expect(state.command_jobs[0]).toMatchObject({
      sourceExternalId: "x-clarify",
      status: "needs_clarification",
    });
    expect(wa.sent[0].body).toContain("What is the main thing");
    expect(wa.sent.find((m) => m.body === "ack")).toBeFalsy();
  });

  it("voice note → acts without sending a noisy transcription banner", async () => {
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
    expect(wa.sent.some((m) => m.body.includes("Transcribed"))).toBe(false);
    expect(wa.sent.some((m) => m.body.includes("got it"))).toBe(true);
  });

  it("does not reprocess a replayed voice note after router restart", async () => {
    let transcribeCalls = 0;
    deps = makeAgentDeps({
      whatsapp: wa,
      transcriber: {
        async transcribe() {
          transcribeCalls += 1;
          return "this is a replay-safe voice note";
        },
      },
      llm: fakeLlmWithToolCall("reply_to_user", { text: "got it" }),
    });
    router = new Router(deps, OWNER);
    const message = {
      id: "x-voice-replay",
      from: OWNER,
      body: "",
      timestamp: new Date(),
      hasMedia: true,
      mediaType: "voice" as const,
      downloadMedia: async () => ({ data: Buffer.from("audio"), mimetype: "audio/ogg" }),
    };

    await router.handle(message);
    const sentAfterFirstRun = wa.sent.length;
    router = new Router(deps, OWNER);
    await router.handle(message);

    const state = getFakeDbState(deps.db);
    expect(transcribeCalls).toBe(1);
    expect(wa.sent).toHaveLength(sentAfterFirstRun);
    expect(state.command_jobs.find((job) => job.sourceExternalId === "x-voice-replay")).toMatchObject({
      command: "this is a replay-safe voice note",
      status: "done",
      dedupeKey: "whatsapp:x-voice-replay",
    });
  });

  it("approval-gates risky voice transcripts before the agent can act", async () => {
    deps = makeAgentDeps({
      whatsapp: wa,
      transcriber: {
        async transcribe() {
          return "send a message to Mukesh saying I am running late";
        },
      },
      llm: fakeLlmWithToolCall("reply_to_user", { text: "should not run" }),
    });
    router = new Router(deps, OWNER);

    await router.handle({
      id: "x-risky-voice",
      from: OWNER,
      body: "",
      timestamp: new Date(),
      hasMedia: true,
      mediaType: "voice",
      downloadMedia: async () => ({ data: Buffer.from("audio"), mimetype: "audio/ogg" }),
    });

    const state = getFakeDbState(deps.db);
    expect(state.command_jobs.find((job) => job.sourceExternalId === "x-risky-voice")).toMatchObject({
      command: "send a message to Mukesh saying I am running late",
      status: "needs_approval",
      riskLevel: "approval_required",
    });
    expect(wa.sent.some((message) => message.body.includes("Needs your approval"))).toBe(true);
    expect(wa.sent.some((message) => message.body.includes("should not run"))).toBe(false);
  });

  it("resends a risky voice approval gate on replay if the first prompt failed to send", async () => {
    let approvalPromptFailures = 0;
    wa.send = async (message) => {
      if (message.body.includes("Needs your approval") && approvalPromptFailures === 0) {
        approvalPromptFailures += 1;
        throw new Error("temporary WhatsApp send failure");
      }
      wa.sent.push(message);
      return { id: `mock-${wa.sent.length}` };
    };
    deps = makeAgentDeps({
      whatsapp: wa,
      transcriber: {
        async transcribe() {
          return "send a message to Mukesh saying I am running late";
        },
      },
      llm: fakeLlmWithToolCall("reply_to_user", { text: "should not run" }),
    });
    router = new Router(deps, OWNER);
    const message = {
      id: "x-risky-voice-approval-replay",
      from: OWNER,
      body: "",
      timestamp: new Date(),
      hasMedia: true,
      mediaType: "voice" as const,
      downloadMedia: async () => ({ data: Buffer.from("audio"), mimetype: "audio/ogg" }),
    };

    await router.handle(message);
    router = new Router(deps, OWNER);
    await router.handle(message);

    const state = getFakeDbState(deps.db);
    expect(state.command_jobs.find((job) => job.sourceExternalId === "x-risky-voice-approval-replay")).toMatchObject({
      status: "needs_approval",
      riskLevel: "approval_required",
    });
    expect(wa.sent.filter((sent) => sent.body.includes("Needs your approval"))).toHaveLength(1);
    expect(wa.sent.some((message) => message.body.includes("should not run"))).toBe(false);
  });

  it("resends a risky voice approval gate on same-process replay", async () => {
    let approvalPromptFailures = 0;
    wa.send = async (message) => {
      if (message.body.includes("Needs your approval") && approvalPromptFailures === 0) {
        approvalPromptFailures += 1;
        throw new Error("temporary WhatsApp send failure");
      }
      wa.sent.push(message);
      return { id: `mock-${wa.sent.length}` };
    };
    deps = makeAgentDeps({
      whatsapp: wa,
      transcriber: {
        async transcribe() {
          return "send a message to Mukesh saying I am running late";
        },
      },
      llm: fakeLlmWithToolCall("reply_to_user", { text: "should not run" }),
    });
    router = new Router(deps, OWNER);
    const message = {
      id: "x-risky-voice-same-process-replay",
      from: OWNER,
      body: "",
      timestamp: new Date(),
      hasMedia: true,
      mediaType: "voice" as const,
      downloadMedia: async () => ({ data: Buffer.from("audio"), mimetype: "audio/ogg" }),
    };

    await router.handle(message);
    await router.handle(message);

    const state = getFakeDbState(deps.db);
    expect(state.command_jobs.find((job) => job.sourceExternalId === "x-risky-voice-same-process-replay")).toMatchObject({
      status: "needs_approval",
      riskLevel: "approval_required",
    });
    expect(wa.sent.filter((sent) => sent.body.includes("Needs your approval"))).toHaveLength(1);
    expect(wa.sent.some((message) => message.body.includes("should not run"))).toBe(false);
  });

  it("safe voice command sends the answer without a separate transcription notice", async () => {
    deps = makeAgentDeps({
      whatsapp: wa,
      transcriber: {
        async transcribe() {
          return "check the weather tomorrow";
        },
      },
      llm: fakeLlmWithToolCall("reply_to_user", { text: "Weather checked." }),
    });
    router = new Router(deps, OWNER);

    await router.handle({
      id: "x-voice-notice-send-failure",
      from: OWNER,
      body: "",
      timestamp: new Date(),
      hasMedia: true,
      mediaType: "voice",
      downloadMedia: async () => ({ data: Buffer.from("audio"), mimetype: "audio/ogg" }),
    });

    const state = getFakeDbState(deps.db);
    expect(state.command_jobs.find((job) => job.sourceExternalId === "x-voice-notice-send-failure")).toMatchObject({
      command: "check the weather tomorrow",
      status: "done",
      riskLevel: "safe",
    });
    expect(wa.sent.some((message) => message.body.includes("Transcribed"))).toBe(false);
    expect(wa.sent.some((message) => message.body.includes("I will reply in English"))).toBe(false);
    expect(wa.sent.some((message) => message.body.includes("Weather checked."))).toBe(true);
  });

  it("hears the last voice message without creating an approval-gated job", async () => {
    deps = makeAgentDeps({
      whatsapp: wa,
      transcriber: fakeTranscriber,
      llm: fakeLlmWithToolCall("reply_to_user", { text: "got it" }),
    });
    router = new Router(deps, OWNER);

    await router.handle({
      id: "x-voice-repeat-source",
      from: OWNER,
      body: "",
      timestamp: new Date("2026-05-09T01:25:00Z"),
      hasMedia: true,
      mediaType: "voice",
      downloadMedia: async () => ({ data: Buffer.from("audio"), mimetype: "audio/ogg" }),
    });
    await router.handle({
      id: "x-voice-repeat-approval-noise",
      from: OWNER,
      body: "approved",
      timestamp: new Date("2026-05-09T01:30:00Z"),
      hasMedia: false,
    });
    wa.sent = [];

    await router.handle({
      id: "x-voice-repeat",
      from: OWNER,
      body: "hear my last message",
      timestamp: new Date("2026-05-09T01:31:00Z"),
      hasMedia: false,
    });

    const state = getFakeDbState(deps.db);
    expect(wa.sent[0].body).toContain("Last voice transcript I have");
    expect(wa.sent[0].body).toContain("this is a transcribed voice note");
    expect(wa.sent[0].body).not.toContain("Needs your approval");
    expect(state.command_jobs.find((job) => job.sourceExternalId === "x-voice-repeat")).toMatchObject({
      status: "done",
      riskLevel: "safe",
    });
  });

  it("treats 'hear it' as a safe repeat request after approval noise", async () => {
    deps = makeAgentDeps({
      whatsapp: wa,
      transcriber: fakeTranscriber,
      llm: fakeLlmWithToolCall("reply_to_user", { text: "got it" }),
    });
    router = new Router(deps, OWNER);

    await router.handle({
      id: "x-voice-hear-it-source",
      from: OWNER,
      body: "",
      timestamp: new Date("2026-05-09T01:25:00Z"),
      hasMedia: true,
      mediaType: "voice",
      downloadMedia: async () => ({ data: Buffer.from("audio"), mimetype: "audio/ogg" }),
    });
    await router.handle({
      id: "x-voice-hear-it-approval-noise",
      from: OWNER,
      body: "approved",
      timestamp: new Date("2026-05-09T01:30:00Z"),
      hasMedia: false,
    });
    wa.sent = [];

    await router.handle({
      id: "x-voice-hear-it",
      from: OWNER,
      body: "hear it",
      timestamp: new Date("2026-05-09T01:31:00Z"),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("Last voice transcript I have");
    expect(wa.sent[0].body).toContain("this is a transcribed voice note");
    expect(wa.sent.some((m) => m.body.includes("What outcome do you want"))).toBe(false);
    expect(wa.sent.some((m) => m.body.includes("Needs your approval"))).toBe(false);
  });

  it("does not get stuck replaying its own repeat replies", async () => {
    deps = makeAgentDeps({
      whatsapp: wa,
      llm: fakeLlmWithToolCall("reply_to_user", { text: "Reminder noted." }),
    });
    router = new Router(deps, OWNER);

    await router.handle({
      id: "x-repeat-loop-source",
      from: OWNER,
      body: "remind me to check the inverter tomorrow",
      timestamp: new Date("2026-05-09T01:20:00Z"),
      hasMedia: false,
    });
    await router.handle({
      id: "x-repeat-loop-first",
      from: OWNER,
      body: "repeat that again",
      timestamp: new Date("2026-05-09T01:21:00Z"),
      hasMedia: false,
    });
    wa.sent = [];

    await router.handle({
      id: "x-repeat-loop-second",
      from: OWNER,
      body: "repeat that again",
      timestamp: new Date("2026-05-09T01:22:00Z"),
      hasMedia: false,
    });

    const state = getFakeDbState(deps.db);
    expect(wa.sent).toHaveLength(1);
    expect(wa.sent[0].body).toContain("Last message I have from you");
    expect(wa.sent[0].body).toContain("remind me to check the inverter tomorrow");
    expect(wa.sent[0].body).not.toContain("Last reply I sent");
    expect(wa.sent[0].body).not.toContain("repeat that again");
    expect(state.command_jobs.find((job) => job.sourceExternalId === "x-repeat-loop-second")).toMatchObject({
      status: "done",
      riskLevel: "safe",
    });
  });

  it("lets non-English voice transcripts reach the agent instead of stopping at clarification", async () => {
    deps = makeAgentDeps({
      whatsapp: wa,
      transcriber: {
        async transcribe() {
          return "రేపు మెల్బోర్న్ వాతావరణం ఎలా ఉంది";
        },
      },
      llm: fakeLlmWithToolCall("reply_to_user", { text: "Tomorrow in Melbourne looks cool and cloudy." }),
    });
    router = new Router(deps, OWNER);

    await router.handle({
      id: "x-telugu-voice",
      from: OWNER,
      body: "",
      timestamp: new Date("2026-05-09T01:55:00Z"),
      hasMedia: true,
      mediaType: "voice",
      downloadMedia: async () => ({ data: Buffer.from("audio"), mimetype: "audio/ogg" }),
    });

    const state = getFakeDbState(deps.db);
    expect(wa.sent.some((m) => m.body.includes("Transcribed"))).toBe(false);
    expect(wa.sent.some((m) => m.body.includes("Tomorrow in Melbourne"))).toBe(true);
    expect(wa.sent.some((m) => m.body.includes("What outcome do you want"))).toBe(false);
    expect(state.command_jobs[0]).toMatchObject({
      sourceExternalId: "x-telugu-voice",
      status: "done",
      riskLevel: "safe",
    });
  });

  it("lets terse safe WhatsApp follow-ups reach the agent instead of asking a generic outcome question", async () => {
    deps = makeAgentDeps({
      whatsapp: wa,
      llm: fakeLlmWithToolCall("reply_to_user", {
        text: "I checked the last thing and here is the next step.",
      }),
    });
    router = new Router(deps, OWNER);

    await router.handle({
      id: "x-terse-followup",
      from: OWNER,
      body: "it says",
      timestamp: new Date("2026-05-09T02:05:00Z"),
      hasMedia: false,
    });

    const state = getFakeDbState(deps.db);
    expect(state.command_jobs[0]).toMatchObject({
      sourceExternalId: "x-terse-followup",
      status: "done",
      riskLevel: "safe",
    });
    expect(wa.sent.some((m) => m.body.includes("What outcome do you want"))).toBe(false);
    expect(wa.sent.some((m) => m.body.includes("I checked the last thing"))).toBe(true);
  });

  it("captures WhatsApp loop regressions as bugs without re-entering the model loop", async () => {
    await router.handle({
      id: "x-loop-bug-report",
      from: OWNER,
      body: "problem: WhatsApp loop came back after I said stop",
      timestamp: new Date("2026-05-09T02:10:00Z"),
      hasMedia: false,
    });

    const state = getFakeDbState(deps.db);
    expect(state.feature_requests).toHaveLength(1);
    expect(state.feature_requests[0]).toMatchObject({
      type: "bug",
      severity: "P1",
      status: "pending",
      source: "whatsapp",
      description: "WhatsApp loop came back after I said stop",
    });
    expect(state.command_jobs.find((job) => job.sourceExternalId === "x-loop-bug-report")).toMatchObject({
      status: "done",
      riskLevel: "safe",
    });
    expect(wa.sent[0].body).toContain("Logged as bug");
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
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

  it("does not reprocess a replayed receipt image after router restart", async () => {
    deps = makeAgentDeps({ whatsapp: wa, imageAnalyzer: fakeImageAnalyzer });
    router = new Router(deps, OWNER);
    const message = {
      id: "x-image-replay",
      from: OWNER,
      body: "",
      timestamp: new Date(),
      hasMedia: true,
      mediaType: "image" as const,
      downloadMedia: async () => ({ data: Buffer.from("img"), mimetype: "image/jpeg" }),
    };

    await router.handle(message);
    const sentAfterFirstRun = wa.sent.length;
    router = new Router(deps, OWNER);
    await router.handle(message);

    const state = getFakeDbState(deps.db);
    expect(state.expenses).toHaveLength(1);
    expect(wa.sent).toHaveLength(sentAfterFirstRun);
    expect(state.command_jobs.find((job) => job.sourceExternalId === "x-image-replay")).toMatchObject({
      status: "done",
      dedupeKey: "whatsapp:x-image-replay",
    });
  });

  it("does not convert a receipt send failure into image fallback or duplicate expense", async () => {
    deps = makeAgentDeps({ whatsapp: wa, imageAnalyzer: fakeImageAnalyzer });
    router = new Router(deps, OWNER);
    wa.send = async () => {
      throw new Error("temporary WhatsApp send failure");
    };
    const message = {
      id: "x-image-send-failure",
      from: OWNER,
      body: "",
      timestamp: new Date(),
      hasMedia: true,
      mediaType: "image" as const,
      downloadMedia: async () => ({ data: Buffer.from("img"), mimetype: "image/jpeg" }),
    };

    await router.handle(message);
    router = new Router(deps, OWNER);
    await router.handle(message);

    const state = getFakeDbState(deps.db);
    expect(state.expenses).toHaveLength(1);
    expect(wa.sent).toHaveLength(0);
    expect(state.command_jobs.find((job) => job.sourceExternalId === "x-image-send-failure")).toMatchObject({
      status: "done",
      resultText: expect.stringContaining("Logged INR 250"),
    });
  });

  it("unsupported PDF-like upload gets an honest extraction fallback", async () => {
    await router.handle({
      id: "x",
      from: OWNER,
      body: "",
      timestamp: new Date(),
      hasMedia: true,
      mediaType: "document",
      downloadMedia: async () => ({
        data: Buffer.from("%PDF-1.4"),
        mimetype: "application/pdf",
        filename: "energy-bill.pdf",
      }),
    });

    expect(wa.sent[0].body).toContain("Document received");
    expect(wa.sent[0].body).toContain("energy-bill.pdf");
    expect(wa.sent[0].body).toContain("PDF/OCR parsing still needs to be wired");
  });

  it("selectable-text PDF upload is extracted and analyzed before replying", async () => {
    await router.handle({
      id: "x",
      from: OWNER,
      body: "",
      timestamp: new Date(),
      hasMedia: true,
      mediaType: "document",
      downloadMedia: async () => ({
        data: makeSimplePdf([
          "AGL Energy electricity bill",
          "Amount due $248.60",
          "Due date 17 May 2026",
        ]),
        mimetype: "application/pdf",
        filename: "bill.pdf",
      }),
    });

    expect(wa.sent[0].body).toContain("Energy bill");
    expect(wa.sent[0].body).toContain("Amount due: AUD 248.60");
    expect(wa.sent[0].body).toContain("Due date: 2026-05-17");
  });

  it("text document upload is extracted and analyzed before replying", async () => {
    await router.handle({
      id: "x",
      from: OWNER,
      body: "",
      timestamp: new Date(),
      hasMedia: true,
      mediaType: "document",
      downloadMedia: async () => ({
        data: Buffer.from("AGL Energy electricity bill\nAmount due $248.60\nDue date 17 May 2026"),
        mimetype: "text/plain",
        filename: "bill.txt",
      }),
    });

    expect(wa.sent[0].body).toContain("Energy bill");
    expect(wa.sent[0].body).toContain("Amount due: AUD 248.60");
    expect(wa.sent[0].body).toContain("Due date: 2026-05-17");
    expect(wa.sent[0].body).toContain("Next: Compare this bill.");
  });

  it("CSV document upload imports expense rows before generic document analysis", async () => {
    await router.handle({
      id: "x-expense-csv",
      from: OWNER,
      body: "",
      timestamp: new Date("2026-05-10T00:00:00Z"),
      hasMedia: true,
      mediaType: "document",
      downloadMedia: async () => ({
        data: Buffer.from("Date,Description,Debit,Credit\n2026-05-09,Uber Trip,18.75,\n2026-05-10,Salary,,1200.00"),
        mimetype: "text/csv",
        filename: "bank-export.csv",
      }),
    });

    const state = getFakeDbState(deps.db);
    expect(state.expenses).toHaveLength(1);
    expect(state.expenses[0]).toMatchObject({
      amount: 1875,
      category: "transport",
      merchant: "Uber Trip",
    });
    expect(wa.sent[0].body).toContain("Imported 1 expense");
    expect(wa.sent[0].body).toContain("Skipped 1 non-expense row");
  });

  it("does not reprocess a replayed CSV document after router restart", async () => {
    const message = {
      id: "x-document-replay",
      from: OWNER,
      body: "",
      timestamp: new Date("2026-05-10T00:00:00Z"),
      hasMedia: true,
      mediaType: "document" as const,
      downloadMedia: async () => ({
        data: Buffer.from("Date,Description,Debit,Credit\n2026-05-09,Uber Trip,18.75,\n2026-05-10,Salary,,1200.00"),
        mimetype: "text/csv",
        filename: "bank-export.csv",
      }),
    };

    await router.handle(message);
    const sentAfterFirstRun = wa.sent.length;
    router = new Router(deps, OWNER);
    await router.handle(message);

    const state = getFakeDbState(deps.db);
    expect(state.expenses).toHaveLength(1);
    expect(wa.sent).toHaveLength(sentAfterFirstRun);
    expect(state.command_jobs.find((job) => job.sourceExternalId === "x-document-replay")).toMatchObject({
      status: "done",
      dedupeKey: "whatsapp:x-document-replay",
    });
  });

  it("does not mark a successful CSV import failed when the WhatsApp reply cannot send", async () => {
    wa.send = async () => {
      throw new Error("temporary WhatsApp send failure");
    };
    const message = {
      id: "x-document-send-failure",
      from: OWNER,
      body: "",
      timestamp: new Date("2026-05-10T00:00:00Z"),
      hasMedia: true,
      mediaType: "document" as const,
      downloadMedia: async () => ({
        data: Buffer.from("Date,Description,Debit,Credit\n2026-05-09,Uber Trip,18.75,\n2026-05-10,Salary,,1200.00"),
        mimetype: "text/csv",
        filename: "bank-export.csv",
      }),
    };

    await router.handle(message);
    router = new Router(deps, OWNER);
    await router.handle(message);

    const state = getFakeDbState(deps.db);
    expect(state.expenses).toHaveLength(1);
    expect(wa.sent).toHaveLength(0);
    expect(state.command_jobs.find((job) => job.sourceExternalId === "x-document-send-failure")).toMatchObject({
      status: "done",
      resultText: expect.stringContaining("Imported 1 expense"),
    });
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

  it("'approved' reply with no pending falls through to the agent instead of clarification", async () => {
    await router.handle({
      id: "x-approved-no-pending",
      from: OWNER,
      body: "approved",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent.some((m) => m.body.includes("What outcome do you want"))).toBe(false);
    expect(wa.sent.find((m) => m.body === "ack")).toBeTruthy();
  });

  it("requires confirmation id before resolving pending email draft approval", async () => {
    const state = getFakeDbState(deps.db);
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

  it("requires confirmation id before resolving pending email draft when user says approved", async () => {
    const state = getFakeDbState(deps.db);
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
      id: "x-approved-email-draft",
      from: OWNER,
      body: "approved",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent.some((m) => m.body.includes("Email drafts need the confirmation id"))).toBe(true);
    expect(wa.sent.some((m) => m.body.includes("05608bae-9152-43ea-bec9-df3a8c6b4c72"))).toBe(true);
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
    expect(state.confirmations[0].status).toBe("pending");
  });

  it("requires confirmation id before resolving pending calendar approval", async () => {
    const state = getFakeDbState(deps.db);
    state.confirmations.push({
      id: "05608bae-9152-43ea-bec9-df3a8c6b4c72",
      action: "create_calendar_event",
      payload: {
        title: "Call Maya",
        start: "2026-05-03T14:00:00Z",
        durationMin: 30,
        participants: ["maya@example.com"],
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

    expect(wa.sent.some((m) => m.body.includes("Calendar changes need the confirmation id"))).toBe(true);
    expect(wa.sent.some((m) => m.body.includes("05608bae-9152-43ea-bec9-df3a8c6b4c72"))).toBe(true);
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
    expect(state.confirmations[0].status).toBe("pending");
  });

  it("resolves pending email draft when confirmation id is included", async () => {
    const state = getFakeDbState(deps.db);
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
    const state = getFakeDbState(deps.db);
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
    const state = getFakeDbState(deps.db);
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
    expect(wa.sent.some((m) => m.body.includes("local operator workflow"))).toBe(true);
    expect(wa.sent.some((m) => m.body.includes("Claude Code"))).toBe(false);
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

  it("home helper shortcut replies directly without the model loop", async () => {
    await router.handle({
      id: "x",
      from: OWNER,
      body: "next steps: Pay electricity bill by Friday. Call dentist tomorrow.",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent.some((m) => m.body.includes("Next steps"))).toBe(true);
    expect(wa.sent.some((m) => m.body.includes("Pay electricity bill"))).toBe(true);
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("message safety shortcut redacts long sensitive numbers", async () => {
    await router.handle({
      id: "x",
      from: OWNER,
      body: "check before send: I am furious. My card is 4111111111111111. Fix this now or else.",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("Check before sending");
    expect(wa.sent[0].body).toContain("contains_sensitive_number");
    expect(wa.sent[0].body).not.toContain("4111111111111111");
    expect(wa.sent[0].body).toContain("********1111");
  });

  it("bill summary shortcut replies directly without the model loop", async () => {
    await router.handle({
      id: "x",
      from: OWNER,
      body: "bill summary: AGL electricity bill $240.50 due 18 May 2026",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("Bill summary");
    expect(wa.sent[0].body).toContain("$240.50");
    expect(wa.sent[0].body).toContain("2026-05-18");
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("emergency card shortcut masks phone numbers before replying", async () => {
    await router.handle({
      id: "x",
      from: OWNER,
      body: "emergency card: Nitesh | 0430008008 | asthma | Mum 0400000000",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("Emergency card");
    expect(wa.sent[0].body).toContain("********8008");
    expect(wa.sent[0].body).toContain("********0000");
    expect(wa.sent[0].body).not.toContain("0430008008");
    expect(wa.sent[0].body).not.toContain("0400000000");
  });

  it("budget split shortcut replies directly without the model loop", async () => {
    await router.handle({
      id: "x",
      from: OWNER,
      body: "budget split: $120 | Nitesh, Sam, Maya | dinner",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("Budget split");
    expect(wa.sent[0].body).toContain("Total: $120.00");
    expect(wa.sent[0].body).toContain("Nitesh: $40.00");
    expect(wa.sent[0].body).toContain("Sam: $40.00");
    expect(wa.sent[0].body).toContain("Maya: $40.00");
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("password reset shortcut gives safe steps without asking for secrets", async () => {
    await router.handle({
      id: "x",
      from: OWNER,
      body: "password reset plan: Gmail | cannot login",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("Password reset plan");
    expect(wa.sent[0].body).toContain("official Gmail recovery page");
    expect(wa.sent[0].body).toContain("Do not send passwords or codes to anyone");
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("leave home shortcut replies directly without the model loop", async () => {
    await router.handle({
      id: "x",
      from: OWNER,
      body: "leave home checklist: overnight | heater, back door",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("Leave home checklist");
    expect(wa.sent[0].body).toContain("Lock doors");
    expect(wa.sent[0].body).toContain("heater");
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });

  it("medicine list shortcut replies with a medical safety warning", async () => {
    await router.handle({
      id: "x",
      from: OWNER,
      body: "medicine list: Nitesh | Ventolin 2 puffs, Vitamin D | keep inhaler nearby",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("Medicine list");
    expect(wa.sent[0].body).toContain("Ventolin 2 puffs");
    expect(wa.sent[0].body).toContain("doctor or pharmacist");
    expect(wa.sent.some((m) => m.body === "ack")).toBe(false);
  });
});
