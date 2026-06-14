import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("external action safety guardrails", () => {
  it("keeps high-risk confirmation actions behind explicit ids", () => {
    const confirmationRail = source("packages/shared/src/features/09-confirmation-rail.ts");
    const router = source("apps/bot/src/router.ts");

    for (const action of ["email_create_draft", "create_calendar_event", "spotify_create_playlist"]) {
      expect(confirmationRail).toContain(`"${action}"`);
      expect(router).toContain(`action === "${action}"`);
    }

    expect(confirmationRail).toContain("if (!args.confirmationId");
    expect(confirmationRail).toContain("SIDE_EFFECT_ACTIONS.has(row.action)");
    expect(router).toContain("need the confirmation id");
  });

  it("does not expose Microsoft sendMail through user-facing email draft tools", () => {
    const emailDrafts = source("packages/shared/src/features/18-email-drafts.ts");
    const microsoftGraph = source("apps/bot/src/microsoft-graph.ts");

    expect(emailDrafts).toContain("creates a draft only");
    expect(emailDrafts).not.toContain("sendMail");
    expect(microsoftGraph).toContain("export async function sendMail");
  });

  it("keeps notification email owner-gated and best-effort", () => {
    const notifyAll = source("apps/bot/src/notify-all.ts");

    expect(notifyAll).toContain("process.env.NOTIFY_EMAIL");
    expect(notifyAll).toContain("hasMsToken()");
    expect(notifyAll).toContain("catch");
    expect(notifyAll).toContain("never blocks a bot reply");
  });
});
