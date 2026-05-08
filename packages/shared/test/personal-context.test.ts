import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/agent/tools.js";
import { registerPersonalContext } from "../src/features/16-personal-context.js";
import { makeAgentDeps } from "./helpers.js";

type LocationOutput = {
  expiresHint?: string;
  location?: string;
  source?: string;
  staleLocationIgnored?: {
    location?: string;
    expiredAt?: string;
  };
};
type BugReportOutput = {
  status?: string;
  type?: string;
};

describe("personal context tools", () => {
  it("saves and resolves a current travel location", async () => {
    const deps = makeAgentDeps({ timezone: "Australia/Melbourne" });
    const registry = new ToolRegistry();
    registerPersonalContext(registry);

    const saved = await registry.get("set_current_location")!.handler(
      { city: "Brisbane", region: "Queensland", country: "Australia", expiresHint: "Monday" },
      { deps, userPhone: "+61430008008", now: deps.now(), timezone: deps.timezone },
    ) as LocationOutput;

    expect(saved.location).toBe("Brisbane, Queensland, Australia");
    expect(saved.expiresHint).toBe("Monday");

    const resolved = await registry.get("get_current_location")!.handler(
      {},
      { deps, userPhone: "+61430008008", now: deps.now(), timezone: deps.timezone },
    ) as LocationOutput;

    expect(resolved.location).toBe("Brisbane, Queensland, Australia");
    expect(resolved.source).toBe("saved_current_location");
  });

  it("ignores expired current locations", async () => {
    const deps = makeAgentDeps({
      timezone: "Australia/Melbourne",
      now: () => new Date("2026-04-25T08:00:00Z"),
      profile: {
        homeLocation: "Melbourne, Victoria, Australia",
        currentLocation: "Melbourne, Victoria, Australia",
        timezone: "Australia/Melbourne",
      },
    });
    const registry = new ToolRegistry();
    registerPersonalContext(registry);

    await registry.get("set_current_location")!.handler(
      {
        city: "Sydney",
        region: "New South Wales",
        country: "Australia",
        expiresAt: "2026-04-24T23:59:59.999Z",
      },
      { deps, userPhone: "+61430008008", now: deps.now(), timezone: deps.timezone },
    );

    const resolved = await registry.get("get_current_location")!.handler(
      {},
      { deps, userPhone: "+61430008008", now: deps.now(), timezone: deps.timezone },
    ) as LocationOutput;

    expect(resolved.location).toBe("Melbourne, Victoria, Australia");
    expect(resolved.source).toBe("profile_default");
    expect(resolved.staleLocationIgnored).toMatchObject({
      location: "Sydney, New South Wales, Australia",
      expiredAt: "2026-04-24T23:59:59.999Z",
    });
  });

  it("falls back to the profile default location", async () => {
    const deps = makeAgentDeps({
      timezone: "Australia/Melbourne",
      profile: {
        homeLocation: "Melbourne, Victoria, Australia",
        currentLocation: "Melbourne, Victoria, Australia",
        timezone: "Australia/Melbourne",
      },
    });
    const registry = new ToolRegistry();
    registerPersonalContext(registry);

    const resolved = await registry.get("get_current_location")!.handler(
      {},
      { deps, userPhone: "+61430008008", now: deps.now(), timezone: deps.timezone },
    ) as LocationOutput;

    expect(resolved.location).toBe("Melbourne, Victoria, Australia");
    expect(resolved.source).toBe("profile_default");
  });

  it("queues explicit bug reports separately from feature requests", async () => {
    const deps = makeAgentDeps();
    const registry = new ToolRegistry();
    registerPersonalContext(registry);

    const bug = await registry.get("report_product_bug")!.handler(
      {
        description: "Weather used Sydney when the default should be Melbourne",
        severity: "P1",
        surface: "whatsapp",
      },
      { deps, userPhone: "+61430008008", now: deps.now(), timezone: deps.timezone },
    ) as BugReportOutput;

    expect(bug.status).toBe("pending");
    expect(bug.type).toBe("bug");
  });
});
