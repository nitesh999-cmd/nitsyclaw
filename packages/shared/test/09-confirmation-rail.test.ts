import { describe, expect, it, vi } from "vitest";
import { resolveConfirmation, registerConfirmationRail } from "../src/features/09-confirmation-rail.js";
import { ToolRegistry } from "../src/agent/tools.js";
import { makeAgentDeps, makeFakeDb } from "./helpers.js";
import type { CalendarClient } from "../src/agent/deps.js";

const NOW = new Date("2026-04-25T08:00:00Z");

describe("resolveConfirmation", () => {
  it("approves when reply is 'y' and confirmation pending", async () => {
    const { db, state } = makeFakeDb();
    state.confirmations.push({
      id: "c1",
      action: "create_calendar_event",
      payload: { title: "x" },
      status: "pending",
      expiresAt: new Date("2026-04-25T09:00:00Z"),
      createdAt: NOW,
    });
    const out = await resolveConfirmation({ db: db as any, reply: "yes", now: NOW });
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
    const out = await resolveConfirmation({ db: db as any, reply: "no", now: NOW });
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
    const out = await resolveConfirmation({ db: db as any, reply: "y", now: NOW });
    expect(out?.decision).toBe("expired");
  });

  it("returns null on non-y/n reply", async () => {
    const { db } = makeFakeDb();
    const out = await resolveConfirmation({ db: db as any, reply: "maybe", now: NOW });
    expect(out).toBeNull();
  });

  it("returns null when nothing pending", async () => {
    const { db } = makeFakeDb();
    const out = await resolveConfirmation({ db: db as any, reply: "y", now: NOW });
    expect(out).toBeNull();
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
    const deps = makeAgentDeps({ db: db as any, calendar });
    const registry = new ToolRegistry();
    registerConfirmationRail(registry);
    const tool = registry.get("resolve_confirmation")!;
    return { db, deps, tool, googleSpy };
  }

  const ctx = (deps: ReturnType<typeof makeAgentDeps>) => ({
    deps,
    now: NOW,
    userPhone: "+61000",
    surface: "whatsapp" as const,
  });

  it("routes outlook payload to createOutlookEvent when method exists", async () => {
    const outlookSpy = vi.fn(async () => ({ id: "o1", htmlLink: "https://outlook/o" }));
    const { tool, deps, googleSpy } = setup({ calendarPayload: "outlook", outlookFn: outlookSpy });
    const out: any = await tool.handler({ reply: "yes" }, ctx(deps) as any);
    expect(outlookSpy).toHaveBeenCalledOnce();
    expect(googleSpy).not.toHaveBeenCalled();
    expect(out.calendar).toBe("outlook");
    expect(out.eventId).toBe("o1");
  });

  it("falls back to Google with note when outlook requested but unavailable on surface", async () => {
    const { tool, deps, googleSpy } = setup({ calendarPayload: "outlook" });
    const out: any = await tool.handler({ reply: "yes" }, ctx(deps) as any);
    expect(googleSpy).toHaveBeenCalledOnce();
    expect(out.calendar).toBe("google");
    expect(out.fallback).toMatch(/outlook unavailable/i);
  });

  it("defaults to Google when payload omits calendar field", async () => {
    const { tool, deps, googleSpy } = setup({});
    const out: any = await tool.handler({ reply: "yes" }, ctx(deps) as any);
    expect(googleSpy).toHaveBeenCalledOnce();
    expect(out.calendar).toBe("google");
  });
});
