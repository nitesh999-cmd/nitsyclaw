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
