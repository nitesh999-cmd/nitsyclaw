import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "../src/agent/tools.js";
import { registerAllFeatures } from "../src/features/index.js";

function tinyRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const name of ["reply_to_user", "web_research", "set_reminder"]) {
    registry.register({
      name,
      description: `${name} description`,
      inputSchema: z.object({ value: z.string() }),
      handler: async () => ({ ok: name }),
    });
  }
  return registry;
}

describe("ToolRegistry.without", () => {
  it("withholds the named tool from lookup and from the model-visible tool list", () => {
    const filtered = tinyRegistry().without("reply_to_user");

    expect(filtered.get("reply_to_user")).toBeUndefined();
    expect(filtered.all().map((t) => t.name)).toEqual(["web_research", "set_reminder"]);
    expect(filtered.toAnthropicTools().map((t) => t.name)).not.toContain("reply_to_user");
  });

  it("leaves the source registry untouched, so other turns keep the tool", () => {
    const registry = tinyRegistry();

    registry.without("reply_to_user");

    expect(registry.get("reply_to_user")).toBeDefined();
    expect(registry.all()).toHaveLength(3);
  });

  it("shares tool definitions by reference rather than copying behaviour", () => {
    const registry = tinyRegistry();
    const filtered = registry.without("reply_to_user");

    expect(filtered.get("web_research")).toBe(registry.get("web_research"));
  });

  it("withholds several tools at once and tolerates unknown names", () => {
    const filtered = tinyRegistry().without("reply_to_user", "not_a_tool");

    expect(filtered.all().map((t) => t.name)).toEqual(["web_research", "set_reminder"]);
  });

  it("returns an equivalent registry when nothing is withheld", () => {
    const filtered = tinyRegistry().without();

    expect(filtered.all()).toHaveLength(3);
  });

  it("removes reply_to_user from the real feature registry without disturbing the rest", () => {
    const full = registerAllFeatures({ surface: "whatsapp" });
    const filtered = full.without("reply_to_user");

    expect(full.get("reply_to_user")).toBeDefined();
    expect(filtered.get("reply_to_user")).toBeUndefined();
    expect(filtered.all()).toHaveLength(full.all().length - 1);
    // Everything a live-research turn still needs is present.
    expect(filtered.get("web_research")).toBeDefined();
    expect(filtered.get("set_current_location")).toBeDefined();
  });
});
