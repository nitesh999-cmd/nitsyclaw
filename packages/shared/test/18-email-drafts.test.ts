import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/agent/tools.js";
import { registerEmailDrafts } from "../src/features/18-email-drafts.js";
import { makeAgentDeps, makeFakeDb } from "./helpers.js";

const NOW = new Date("2026-05-03T13:30:00.000Z");

describe("queue_email_draft_creation", () => {
  function setup() {
    const { db, state } = makeFakeDb();
    const deps = makeAgentDeps({
      db,
      now: () => NOW,
      timezone: "Australia/Melbourne",
    });
    const registry = new ToolRegistry();
    registerEmailDrafts(registry);
    const tool = registry.get("queue_email_draft_creation")!;
    const ctx = {
      userPhone: "+61430008008",
      now: NOW,
      timezone: "Australia/Melbourne",
      deps,
    };
    return { tool, ctx, state };
  }

  it("queues an approval-gated draft creation request and dedupes recipients", async () => {
    const { tool, ctx, state } = setup();

    const out = await tool.handler(
      {
        provider: "gmail",
        to: ["A@Example.com", "a@example.com"],
        cc: ["c@example.com"],
        subject: " Hello ",
        body: "Long enough email body",
      },
      ctx,
    );

    expect(out).toMatchObject({
      queued: true,
      action: "email_create_draft",
      provider: "gmail",
      recipientCount: 2,
      subjectPreview: "Hello",
    });
    expect((out as { instruction: string }).instruction).toContain("yes ");
    expect(state.confirmations).toHaveLength(1);
    expect(state.confirmations[0]).toMatchObject({
      action: "email_create_draft",
      status: "pending",
    });
    expect(state.confirmations[0].payload.to).toEqual(["a@example.com"]);
  });

  it("rejects invalid addresses before the handler runs", () => {
    const { tool } = setup();

    const parsed = tool.inputSchema.safeParse({
      provider: "gmail",
      to: ["not-an-email"],
      subject: "Hi",
      body: "Body",
    });

    expect(parsed.success).toBe(false);
  });

  it("does not expose a send_email tool", () => {
    const registry = new ToolRegistry();
    registerEmailDrafts(registry);

    expect(registry.get("queue_email_draft_creation")).toBeTruthy();
    expect(registry.get("send_email")).toBeUndefined();
  });
});
