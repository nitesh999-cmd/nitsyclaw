import { describe, expect, it } from "vitest";
import {
  buildFeatureQueueMirror,
  formatFeatureQueueStatusForWhatsApp,
  summarizeFeatureQueueStatus,
} from "../src/features/feature-queue-status.js";

describe("feature queue status summary", () => {
  it("groups setup-heavy integrations and picks a safe code-only next build", () => {
    const summary = summarizeFeatureQueueStatus({
      pending: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          description: "Read and send emails on behalf of the user via Gmail and Outlook",
          type: "feature",
          severity: null,
          size: "M",
          source: "whatsapp",
          implementationNotes: null,
          createdAt: new Date("2026-05-08T10:00:00Z"),
          completedAt: null,
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          description: "Improve dashboard mobile navigation labels",
          type: "feature",
          severity: null,
          size: "S",
          source: "dashboard",
          implementationNotes: null,
          createdAt: new Date("2026-05-08T11:00:00Z"),
          completedAt: null,
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          description: "Spotify full assistant",
          type: "feature",
          severity: null,
          size: "M",
          source: "whatsapp",
          implementationNotes: null,
          createdAt: new Date("2026-05-08T12:00:00Z"),
          completedAt: null,
        },
      ],
      completed: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          description: "Integration Request Router",
          type: "feature",
          severity: null,
          size: "M",
          source: "whatsapp",
          implementationNotes: "Committed and tested.",
          createdAt: new Date("2026-05-08T09:00:00Z"),
          completedAt: new Date("2026-05-09T00:00:00Z"),
        },
      ],
      limit: 5,
    });

    expect(summary.pendingCount).toBe(3);
    expect(summary.recommendedNext?.shortId).toBe("22222222");
    expect(summary.quickWins.map((item) => item.shortId)).toEqual(["22222222"]);
    expect(summary.setupHeavy.map((item) => item.category)).toEqual(["email", "music"]);
    expect(summary.batches.find((batch) => batch.key === "email")?.count).toBe(1);

    const reply = formatFeatureQueueStatusForWhatsApp(summary);
    expect(reply).toContain("Feature queue: 3 pending");
    expect(reply).toContain("State:");
    expect(reply).toContain("Best safe next:");
    expect(reply).toContain("Needs setup before live action:");
    expect(reply).toContain("Next:");
    expect(reply.split("\n").length).toBeLessThanOrEqual(8);
    expect(reply.length).toBeLessThanOrEqual(780);
    expect(reply).not.toContain("Claude Code");
    expect(reply).not.toContain("*nwp");
  });

  it("builds a redacted read-only operator queue mirror", () => {
    const mirror = buildFeatureQueueMirror({
      pending: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          description: "Read Gmail and Outlook for nitesh@example.com and +61430008008.",
          type: "feature",
          severity: "P1",
          size: "M",
          source: "whatsapp",
          implementationNotes: "internal raw note should not be exposed",
          createdAt: new Date("2026-05-08T10:00:00Z"),
          completedAt: null,
        },
      ],
    });

    expect(mirror.pendingCount).toBe(1);
    expect(mirror.recommendedNext?.shortId).toBe("11111111");
    expect(mirror.rows[0]).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      shortId: "11111111",
      category: "email",
      setupHeavy: true,
      createdAt: "2026-05-08T10:00:00.000Z",
    });
    expect(mirror.safety).toContain("Read-only queue mirror");
    expect(JSON.stringify(mirror)).not.toContain("internal raw note");
    expect(JSON.stringify(mirror)).not.toContain("nitesh@example.com");
    expect(JSON.stringify(mirror)).not.toContain("+61430008008");
    expect(JSON.stringify(mirror)).toContain("[email]");
    expect(JSON.stringify(mirror)).toContain("[phone]");
    expect(JSON.stringify(mirror)).not.toContain("dedupe");
    expect(JSON.stringify(mirror)).not.toContain("requestedBy");
  });

  it("uses priority scoring before recommending the next local build", () => {
    const summary = summarizeFeatureQueueStatus({
      now: new Date("2026-05-30T00:00:00Z"),
      pending: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          description: "Improve dashboard copy",
          type: "feature",
          severity: null,
          size: "S",
          source: "dashboard",
          implementationNotes: null,
          createdAt: new Date("2026-05-29T00:00:00Z"),
          completedAt: null,
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          description: "Reliability bug: WhatsApp loop breaker opened too often",
          type: "bug",
          severity: "P1",
          size: "S",
          source: "whatsapp",
          implementationNotes: null,
          createdAt: new Date("2026-05-28T00:00:00Z"),
          completedAt: null,
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          description: "Connect Google Photos account",
          type: "feature",
          severity: null,
          size: "S",
          source: "whatsapp",
          implementationNotes: null,
          createdAt: new Date("2026-05-01T00:00:00Z"),
          completedAt: null,
        },
      ],
    });

    expect(summary.recommendedNext).toMatchObject({
      shortId: "22222222",
      priority: "P0",
      setupHeavy: false,
    });
    expect(summary.topPending.map((item) => item.shortId)).toEqual(["22222222", "11111111", "33333333"]);
  });
});
