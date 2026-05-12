import { describe, expect, it, vi } from "vitest";
import { resolveConfirmation, registerConfirmationRail } from "../src/features/09-confirmation-rail.js";
import { ToolRegistry } from "../src/agent/tools.js";
import { getFakeDbState, makeAgentDeps, makeFakeDb } from "./helpers.js";
import type { CalendarClient } from "../src/agent/deps.js";
import type { ToolContext } from "../src/agent/tools.js";

const NOW = new Date("2026-04-25T08:00:00Z");
type ToolOutput = Record<string, unknown> & {
  action?: string;
  calendar?: string;
  decision?: string;
  draftCreated?: boolean;
  draftId?: string;
  eventId?: string;
  fallback?: string;
  playlist?: { id?: string };
  resolved?: boolean;
  unavailable?: string;
};

describe("resolveConfirmation", () => {
  it("approves when reply is 'y' with the confirmation id", async () => {
    const { db, state } = makeFakeDb();
    state.confirmations.push({
      id: "c1",
      action: "create_calendar_event",
      payload: { title: "x" },
      status: "pending",
      expiresAt: new Date("2026-04-25T09:00:00Z"),
      createdAt: NOW,
    });
    const out = await resolveConfirmation({ db, reply: "yes", confirmationId: "c1", now: NOW });
    expect(out?.decision).toBe("approved");
  });

  it("approves when reply is 'approved' with the confirmation id", async () => {
    const { db, state } = makeFakeDb();
    state.confirmations.push({
      id: "c1",
      action: "create_calendar_event",
      payload: { title: "x" },
      status: "pending",
      expiresAt: new Date("2026-04-25T09:00:00Z"),
      createdAt: NOW,
    });

    const out = await resolveConfirmation({ db, reply: "approved", confirmationId: "c1", now: NOW });

    expect(out?.decision).toBe("approved");
  });

  it("rejects when reply is 'n'", async () => {
    const { db, state } = makeFakeDb();
    state.confirmations.push({
      id: "c1",
      action: "x",
      payload: {},
      status: "pending",
      expiresAt: new Date("2026-04-25T09:00:00Z"),
      createdAt: NOW,
    });
    const out = await resolveConfirmation({ db, reply: "no", confirmationId: "c1", now: NOW });
    expect(out?.decision).toBe("rejected");
  });

  it("expires when past expiresAt", async () => {
    const { db, state } = makeFakeDb();
    state.confirmations.push({
      id: "c1",
      action: "x",
      payload: {},
      status: "pending",
      expiresAt: new Date("2026-04-25T07:00:00Z"),
      createdAt: NOW,
    });
    const out = await resolveConfirmation({ db, reply: "y", confirmationId: "c1", now: NOW });
    expect(out?.decision).toBe("expired");
  });

  it("returns null on non-y/n reply", async () => {
    const { db } = makeFakeDb();
    const out = await resolveConfirmation({ db, reply: "maybe", now: NOW });
    expect(out).toBeNull();
  });

  it("returns null when nothing pending", async () => {
    const { db } = makeFakeDb();
    const out = await resolveConfirmation({ db, reply: "y", now: NOW });
    expect(out).toBeNull();
  });

  it("does not resolve side-effect confirmations without an explicit confirmation id", async () => {
    const { db, state } = makeFakeDb();
    state.confirmations.push({
      id: "c1",
      action: "email_create_draft",
      payload: { provider: "gmail", to: ["a@example.com"], subject: "S", body: "B" },
      status: "pending",
      expiresAt: new Date("2026-04-25T09:00:00Z"),
      createdAt: NOW,
    });

    const out = await resolveConfirmation({ db, reply: "yes", now: NOW });

    expect(out).toBeNull();
    expect(state.confirmations[0].status).toBe("pending");
  });

  it("does not resolve pending Spotify playlist creation without an explicit confirmation id", async () => {
    const { db, state } = makeFakeDb();
    state.confirmations.push({
      id: "c1",
      action: "spotify_create_playlist",
      payload: { name: "Mix", uris: ["spotify:track:1"] },
      status: "pending",
      expiresAt: new Date("2026-04-25T09:00:00Z"),
      createdAt: NOW,
    });

    const out = await resolveConfirmation({ db, reply: "yes", now: NOW });

    expect(out).toBeNull();
    expect(state.confirmations[0].status).toBe("pending");
  });

  it("does not resolve pending calendar creation without an explicit confirmation id", async () => {
    const { db, state } = makeFakeDb();
    state.confirmations.push({
      id: "c1",
      action: "create_calendar_event",
      payload: { title: "Call" },
      status: "pending",
      expiresAt: new Date("2026-04-25T09:00:00Z"),
      createdAt: NOW,
    });

    const out = await resolveConfirmation({ db, reply: "yes", now: NOW });

    expect(out).toBeNull();
    expect(state.confirmations[0].status).toBe("pending");
  });
});

describe("resolve_confirmation tool — calendar routing", () => {
  function setup(opts: { calendarPayload?: "google" | "outlook"; outlookFn?: CalendarClient["createOutlookEvent"] }) {
    const { db, state } = makeFakeDb();
    state.confirmations.push({
      id: "c1",
      action: "create_calendar_event",
      payload: {
        title: "T",
        start: "2026-04-25T09:00:00Z",
        durationMin: 30,
        participants: ["a@b.com"],
        ...(opts.calendarPayload ? { calendar: opts.calendarPayload } : {}),
      },
      status: "pending",
      expiresAt: new Date("2026-04-25T10:00:00Z"),
      createdAt: NOW,
    });
    const googleSpy = vi.fn(async () => ({ id: "g1", htmlLink: "https://cal/g" }));
    const calendar: CalendarClient = {
      async suggestSlots() { return []; },
      createEvent: googleSpy,
      ...(opts.outlookFn ? { createOutlookEvent: opts.outlookFn } : {}),
    };
    const deps = makeAgentDeps({ db, calendar });
    const registry = new ToolRegistry();
    registerConfirmationRail(registry);
    const tool = registry.get("resolve_confirmation")!;
    return { db, deps, tool, googleSpy };
  }

  const ctx = (deps: ReturnType<typeof makeAgentDeps>): ToolContext => ({
    deps,
    now: NOW,
    userPhone: "+61000",
    timezone: "Australia/Melbourne",
  });

  it("routes outlook payload to createOutlookEvent when method exists", async () => {
    const outlookSpy = vi.fn(async () => ({ id: "o1", htmlLink: "https://outlook/o" }));
    const { tool, deps, googleSpy } = setup({ calendarPayload: "outlook", outlookFn: outlookSpy });
    const out = await tool.handler({ reply: "yes", confirmationId: "c1" }, ctx(deps)) as ToolOutput;
    expect(outlookSpy).toHaveBeenCalledOnce();
    expect(googleSpy).not.toHaveBeenCalled();
    expect(out.calendar).toBe("outlook");
    expect(out.eventId).toBe("o1");
  });

  it("falls back to Google with note when outlook requested but unavailable on surface", async () => {
    const { tool, deps, googleSpy } = setup({ calendarPayload: "outlook" });
    const out = await tool.handler({ reply: "yes", confirmationId: "c1" }, ctx(deps)) as ToolOutput;
    expect(googleSpy).toHaveBeenCalledOnce();
    expect(out.calendar).toBe("google");
    expect(out.fallback).toMatch(/outlook unavailable/i);
  });

  it("defaults to Google when payload omits calendar field", async () => {
    const { tool, deps, googleSpy } = setup({});
    const out = await tool.handler({ reply: "yes", confirmationId: "c1" }, ctx(deps)) as ToolOutput;
    expect(googleSpy).toHaveBeenCalledOnce();
    expect(out.calendar).toBe("google");
  });
});

describe("resolve_confirmation tool — email draft routing", () => {
  function setup(opts: { withAdapter?: boolean; expiresAt?: Date; status?: "pending" | "rejected" }) {
    const { db, state } = makeFakeDb();
    state.confirmations.push({
      id: "c1",
      action: "email_create_draft",
      payload: {
        provider: "gmail",
        to: ["nitesh@example.com"],
        subject: "Hi",
        body: "Private body",
      },
      status: opts.status ?? "pending",
      expiresAt: opts.expiresAt ?? new Date("2026-04-25T10:00:00Z"),
      createdAt: NOW,
    });
    const createDraft = vi.fn(async () => ({ draftId: "draft-1", webLink: "https://mail/draft-1" }));
    const deps = makeAgentDeps({
      db,
      ...(opts.withAdapter ? { emailDraft: { createDraft } } : {}),
    });
    const registry = new ToolRegistry();
    registerConfirmationRail(registry);
    const tool = registry.get("resolve_confirmation")!;
    const ctx: ToolContext = {
      deps,
      now: NOW,
      userPhone: "+61000",
      timezone: "Australia/Melbourne",
    };
    return { tool, ctx, createDraft };
  }

  it("creates a draft through the configured adapter after approval", async () => {
    const { tool, ctx, createDraft } = setup({ withAdapter: true });

    const out = await tool.handler({ reply: "yes", confirmationId: "c1" }, ctx) as ToolOutput;

    expect(createDraft).toHaveBeenCalledOnce();
    expect(out).toMatchObject({
      resolved: true,
      decision: "approved",
      action: "email_create_draft",
      draftCreated: true,
      draftId: "draft-1",
    });
  });

  it("returns unavailable instead of pretending a draft was created when adapter is missing", async () => {
    const { tool, ctx } = setup({});

    const out = await tool.handler({ reply: "yes", confirmationId: "c1" }, ctx) as ToolOutput;

    expect(out).toMatchObject({
      resolved: true,
      decision: "pending_adapter",
      action: "email_create_draft",
      draftCreated: false,
    });
    expect(out.unavailable).toMatch(/not configured/i);
    expect(getFakeDbState(ctx.deps.db).confirmations[0].status).toBe("pending");
  });

  it("does not create an expired email draft", async () => {
    const { tool, ctx, createDraft } = setup({
      withAdapter: true,
      expiresAt: new Date("2026-04-25T07:00:00Z"),
    });

    const out = await tool.handler({ reply: "yes", confirmationId: "c1" }, ctx) as ToolOutput;

    expect(createDraft).not.toHaveBeenCalled();
    expect(out).toMatchObject({ resolved: true, decision: "expired", action: "email_create_draft" });
  });
});
