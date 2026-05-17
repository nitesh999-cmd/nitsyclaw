import { describe, expect, it } from "vitest";
import { makeAgentDeps } from "@nitsyclaw/shared/../test/helpers.js";
import { MockWhatsAppClient } from "@nitsyclaw/shared/whatsapp";
import { buildNightlyWhatsAppHealthReport, sendNightlyWhatsAppHealthReport } from "./nightly-health-report.js";

describe("nightly WhatsApp health report", () => {
  it("builds a ready report from fresh heartbeats without exposing provider claims", async () => {
    const wa = new MockWhatsAppClient();
    const now = new Date("2026-05-17T10:50:00Z");
    const deps = makeAgentDeps({
      whatsapp: wa,
      now: () => now,
      timezone: "Australia/Melbourne",
    });
    const state = deps.db.__state;
    state.system_heartbeats.push(
      heartbeat("bot-runtime", "ok", now, { commitShort: "abc1234" }),
      heartbeat("bot-scheduler", "ok", now),
      heartbeat("whatsapp-client", "ok", now),
      heartbeat("whatsapp-send", "ok", now),
      heartbeat("whatsapp-loop-guard", "ok", now),
    );

    const report = await buildNightlyWhatsAppHealthReport(deps);

    expect(report.status).toBe("ready");
    expect(report.body).toContain("Nightly WhatsApp health");
    expect(report.body).toContain("Status: ready");
    expect(report.body).toContain("Version: commit abc1234");
    expect(report.body).toContain("WhatsApp client: ok (ok");
    expect(report.body).toContain("WhatsApp send: ok (ok");
    expect(report.body).toContain("Loop guard: ok (ok");
    expect(report.body).toContain("Provider setup is not tested here");
    expect(report.body).not.toContain("Gmail ready");
    expect(report.body).not.toContain("bank feed connected");
  });

  it("marks the report as needs attention when WhatsApp send has an error", async () => {
    const wa = new MockWhatsAppClient();
    const now = new Date("2026-05-17T10:50:00Z");
    const deps = makeAgentDeps({
      whatsapp: wa,
      now: () => now,
      timezone: "Australia/Melbourne",
    });
    const state = deps.db.__state;
    state.system_heartbeats.push(
      heartbeat("bot-runtime", "ok", now, { commitShort: "abc1234" }),
      heartbeat("bot-scheduler", "ok", now),
      heartbeat("whatsapp-client", "ok", now),
      heartbeat("whatsapp-send", "error", now, { error: "temporary send failure with private text removed" }),
      heartbeat("whatsapp-loop-guard", "ok", now),
    );

    const report = await sendNightlyWhatsAppHealthReport(deps, "+61430008008");

    expect(report.status).toBe("needs_attention");
    expect(wa.sent).toHaveLength(1);
    expect(wa.sent[0].to).toBe("+61430008008");
    expect(wa.sent[0].body).toContain("Status: needs attention");
    expect(wa.sent[0].body).toContain("last error: temporary send failure");
    expect(wa.sent[0].body).toContain("Next: send what went wrong or proof details");
  });
});

function heartbeat(
  source: string,
  status: string,
  lastSeenAt: Date,
  metadata: Record<string, unknown> = {},
) {
  return {
    id: crypto.randomUUID(),
    source,
    status,
    lastSeenAt,
    metadata,
    updatedAt: lastSeenAt,
  };
}
