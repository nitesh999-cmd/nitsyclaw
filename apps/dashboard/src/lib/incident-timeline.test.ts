import { describe, expect, it } from "vitest";
import { buildIncidentTimeline } from "./incident-timeline";

describe("incident timeline", () => {
  it("records failed tools with affected surface, actions, and unverified recovery proof", () => {
    const timeline = buildIncidentTimeline({
      now: new Date("2026-05-31T04:00:00.000Z"),
      auditRows: [
        {
          id: "audit-1",
          tool: "whatsapp_send",
          success: false,
          error: "temporary send failure",
          createdAt: new Date("2026-05-31T03:50:00.000Z"),
        },
      ],
      commandJobs: [],
      heartbeats: [],
    });

    expect(timeline.status).toBe("action");
    expect(timeline.items[0]).toMatchObject({
      severity: "P1",
      status: "open",
      symptom: "whatsapp_send failed: temporary send failure",
      affectedSurfaces: ["WhatsApp"],
      recoveryProof: "UNVERIFIED: no later successful audit row found.",
    });
    expect(timeline.items[0]?.actionsTaken).toContain("Run the focused smoke or command that covers this surface.");
  });

  it("marks a failed audit recovered when a later successful audit exists", () => {
    const timeline = buildIncidentTimeline({
      auditRows: [
        {
          id: "audit-ok",
          tool: "expense_log",
          success: true,
          durationMs: 300,
          createdAt: "2026-05-31T03:55:00.000Z",
        },
        {
          id: "audit-fail",
          tool: "expense_log",
          success: false,
          error: "validation failed",
          createdAt: "2026-05-31T03:45:00.000Z",
        },
      ],
      commandJobs: [],
      heartbeats: [],
    });

    expect(timeline.status).toBe("clear");
    expect(timeline.items[0]).toMatchObject({
      status: "recovered",
      affectedSurfaces: ["Expenses"],
      recoveryProof: "Later successful expense_log audit row found.",
    });
  });

  it("flags failed command jobs and stale heartbeats", () => {
    const timeline = buildIncidentTimeline({
      now: new Date("2026-05-31T04:00:00.000Z"),
      auditRows: [],
      commandJobs: [
        {
          id: "job-1",
          source: "whatsapp",
          command: "send risky thing",
          status: "failed",
          error: "approval expired",
          createdAt: "2026-05-31T03:40:00.000Z",
          updatedAt: "2026-05-31T03:45:00.000Z",
        },
      ],
      heartbeats: [
        {
          source: "bot-runtime",
          status: "ok",
          lastSeenAt: "2026-05-31T03:00:00.000Z",
        },
      ],
    });

    expect(timeline.status).toBe("action");
    expect(timeline.items.map((item) => item.symptom)).toContain("whatsapp command failed: approval expired");
    expect(timeline.items.map((item) => item.symptom)).toContain("bot-runtime heartbeat is 60m old.");
  });
});
