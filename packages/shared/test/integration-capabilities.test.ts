import { describe, expect, it } from "vitest";
import type { AgentDeps } from "../src/agent/deps.js";
import { ToolRegistry } from "../src/agent/tools.js";
import {
  INTEGRATION_CAPABILITIES,
  registerIntegrationCapabilities,
} from "../src/features/17-integration-capabilities.js";

describe("integration capabilities", () => {
  it("covers every requested integration area with an honest non-available status", () => {
    expect(Object.keys(INTEGRATION_CAPABILITIES).sort()).toEqual([
      "bank_feeds",
      "drive_onedrive",
      "email_sending",
      "facebook_birthdays",
      "google_photos",
      "phone_sms",
      "social_video_analysis",
    ]);

    expect(INTEGRATION_CAPABILITIES.email_sending.status).toBe("partial");
    expect(INTEGRATION_CAPABILITIES.drive_onedrive.status).toBe("needs_setup");
    expect(INTEGRATION_CAPABILITIES.phone_sms.status).toBe("needs_setup");
    expect(INTEGRATION_CAPABILITIES.bank_feeds.status).toBe("blocked");
    expect(INTEGRATION_CAPABILITIES.google_photos.status).toBe("needs_setup");
    expect(INTEGRATION_CAPABILITIES.facebook_birthdays.status).toBe("blocked");
    expect(INTEGRATION_CAPABILITIES.social_video_analysis.status).toBe("partial");
  });

  it("returns all capabilities and includes a guardrail rule", async () => {
    const registry = new ToolRegistry();
    registerIntegrationCapabilities(registry);
    const tool = registry.get("list_integration_capabilities");

    const result = await tool?.handler(
      {},
      {
        userPhone: "test",
        now: new Date("2026-05-03T00:00:00.000Z"),
        timezone: "Australia/Melbourne",
        deps: {} as AgentDeps,
      },
    );

    expect(result).toMatchObject({
      count: 7,
      rule: expect.stringContaining("Only call an integration live"),
    });
  });

  it("does not register fake live tools for integrations that still need setup", () => {
    const registry = new ToolRegistry();
    registerIntegrationCapabilities(registry);
    const names = registry.all().map((tool) => tool.name);

    expect(names).not.toContain("send_email");
    expect(names).not.toContain("drive_search");
    expect(names).not.toContain("onedrive_search");
    expect(names).not.toContain("send_sms");
    expect(names).not.toContain("bank_feed_sync");
    expect(names).not.toContain("google_photos_search");
    expect(names).not.toContain("facebook_birthdays");
    expect(names).not.toContain("analyze_social_video");
  });

  it("can filter to a single capability", async () => {
    const registry = new ToolRegistry();
    registerIntegrationCapabilities(registry);
    const tool = registry.get("list_integration_capabilities");

    const result = (await tool?.handler(
      { area: "bank_feeds" },
      {
        userPhone: "test",
        now: new Date("2026-05-03T00:00:00.000Z"),
        timezone: "Australia/Melbourne",
        deps: {} as AgentDeps,
      },
    )) as { count: number; capabilities: Array<{ area: string; status: string }> };

    expect(result.count).toBe(1);
    expect(result.capabilities[0]).toMatchObject({ area: "bank_feeds", status: "blocked" });
  });
});
