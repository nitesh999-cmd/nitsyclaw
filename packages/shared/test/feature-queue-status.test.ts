import { describe, expect, it } from "vitest";
import {
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
    expect(reply).toContain("Recently shipped");
    expect(reply).toContain("Best next safe build");
    expect(reply).toContain("Setup-heavy items waiting on provider access/OAuth");
    expect(reply).not.toContain("Claude Code");
    expect(reply).not.toContain("*nwp");
  });
});
