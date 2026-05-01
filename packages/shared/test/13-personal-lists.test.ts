import { describe, expect, it } from "vitest";
import { registerPersonalLists } from "../src/features/13-personal-lists.js";
import { ToolRegistry } from "../src/agent/tools.js";
import { makeAgentDeps } from "./helpers.js";

describe("personal lists", () => {
  it("saves and lists can't-do items", async () => {
    const deps = makeAgentDeps();
    const registry = new ToolRegistry();
    registerPersonalLists(registry);

    await registry.get("add_cant_do_item")!.handler(
      { item: "Do not accept unpaid custom website work", severity: "hard_no" },
      { deps, userPhone: "+61430008008", now: deps.now(), timezone: deps.timezone },
    );

    const out: any = await registry.get("list_cant_do_items")!.handler(
      {},
      { deps, userPhone: "+61430008008", now: deps.now(), timezone: deps.timezone },
    );

    expect(out.count).toBe(1);
    expect(out.items[0].item).toContain("unpaid custom website work");
  });

  it("saves and lists birthday templates", async () => {
    const deps = makeAgentDeps();
    const registry = new ToolRegistry();
    registerPersonalLists(registry);

    await registry.get("add_birthday_template")!.handler(
      {
        name: "client warm",
        tone: "professional",
        message: "Happy birthday. Wishing you a strong year ahead.",
      },
      { deps, userPhone: "+61430008008", now: deps.now(), timezone: deps.timezone },
    );

    const out: any = await registry.get("list_birthday_templates")!.handler(
      {},
      { deps, userPhone: "+61430008008", now: deps.now(), timezone: deps.timezone },
    );

    expect(out.count).toBe(1);
    expect(out.items[0].template).toContain("client warm");
  });
});
