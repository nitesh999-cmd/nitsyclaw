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
import { generateKey } from "@nitsyclaw/shared/utils";

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
  });

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

  it("creates a durable command job and receipt before the default agent loop", async () => {
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
    expect(wa.sent[0].body).toContain("Saved");
    expect(wa.sent[0].body).toContain("Working on it");
    expect(wa.sent.find((m) => m.body === "ack")).toBeTruthy();
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
    expect(wa.sent[0].body).toContain("Recently shipped");
    expect(wa.sent[0].body).toContain("Best next safe build");
    expect(wa.sent[0].body).toContain("Improve dashboard mobile navigation labels");
    expect(wa.sent[0].body).toContain("Setup-heavy items waiting on provider access/OAuth");
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

    expect(wa.sent[0].body).toContain("Working now");
    expect(wa.sent[0].body).toContain("CSV expense import");
    expect(wa.sent[0].body).toContain("Needs setup");
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

    await router.handle({
      id: "x-clean-status",
      from: OWNER,
      body: "status",
      timestamp: new Date(),
      hasMedia: false,
    });

    expect(wa.sent[0].body).toContain("NitsyClaw status");
    expect(wa.sent[0].body).toContain("Ready now");
    expect(wa.sent[0].body).toContain("Pending: 2 item");
    expect(wa.sent[0].body).toContain("Improve dashboard mobile navigation labels");
    expect(wa.sent[0].body).toContain("Needs setup before real action");
    expect(wa.sent[0].body).toContain("Read and send emails");
    expect(wa.sent[0].body).toContain("Recently shipped");
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

    expect(wa.sent[0].body).toContain("Files/documents");
    expect(wa.sent[0].body).toContain("agl-bill.txt");
    expect(wa.sent[0].body).toContain("Reminders");
    expect(wa.sent[0].body).toContain("call dentist");
    expect(wa.sent[0].body).toContain("Expenses");
    expect(wa.sent[0].body).toContain("AUD 18.75");
    expect(wa.sent[0].body).toContain("Summaries");
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
    expect(wa.sent.filter((message) => message.body.includes("Saved"))).toHaveLength(1);
    expect(wa.sent.filter((message) => message.body === "ack")).toHaveLength(1);
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
    expect(wa.sent.filter((message) => message.body.includes("NitsyClaw status"))).toHaveLength(1);
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
    expect(wa.sent.filter((message) => message.body.includes("NitsyClaw status"))).toHaveLength(1);
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
      receiptText: "Saved. Working on it.",
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
    expect(wa.sent.some((m) => m.body.includes("Transcribed"))).toBe(true);
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
