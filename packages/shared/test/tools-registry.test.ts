import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ToolRegistry, zodToJsonSchema } from "../src/agent/tools.js";
import { registerAllFeatures } from "../src/features/index.js";

describe("ToolRegistry", () => {
  it("registers and retrieves tools", () => {
    const r = new ToolRegistry();
    r.register({
      name: "x",
      description: "x",
      inputSchema: z.object({ a: z.string() }),
      handler: async () => ({}),
    });
    expect(r.get("x")?.name).toBe("x");
    expect(r.all()).toHaveLength(1);
  });

  it("rejects duplicate names", () => {
    const r = new ToolRegistry();
    r.register({ name: "x", description: "x", inputSchema: z.object({}), handler: async () => ({}) });
    expect(() =>
      r.register({ name: "x", description: "x", inputSchema: z.object({}), handler: async () => ({}) }),
    ).toThrow(/already registered/);
  });

  it("emits anthropic-shaped tool defs", () => {
    const r = new ToolRegistry();
    r.register({
      name: "x",
      description: "d",
      inputSchema: z.object({ a: z.string(), b: z.number().optional() }),
      handler: async () => ({}),
    });
    const tools = r.toAnthropicTools();
    expect(tools[0].name).toBe("x");
    expect(tools[0].description).toBe("d");
    expect(tools[0].input_schema).toMatchObject({ type: "object" });
  });
});

describe("zodToJsonSchema", () => {
  it("converts object with required and optional", () => {
    const out: any = zodToJsonSchema(z.object({ a: z.string(), b: z.number().optional() }));
    expect(out.type).toBe("object");
    expect(out.properties.a).toEqual({ type: "string" });
    expect(out.properties.b).toEqual({ type: "number" });
    expect(out.required).toEqual(["a"]);
  });

  it("handles primitives", () => {
    expect(zodToJsonSchema(z.string())).toEqual({ type: "string" });
    expect(zodToJsonSchema(z.boolean())).toEqual({ type: "boolean" });
  });

  it("handles enums", () => {
    expect(zodToJsonSchema(z.enum(["a", "b"]))).toEqual({ type: "string", enum: ["a", "b"] });
  });

  it("handles arrays", () => {
    expect(zodToJsonSchema(z.array(z.string()))).toEqual({
      type: "array",
      items: { type: "string" },
    });
  });
});

describe("registerAllFeatures", () => {
  it("includes personal context tools", () => {
    const registry = registerAllFeatures({ surface: "whatsapp" });

    expect(registry.get("set_current_location")).toBeTruthy();
    expect(registry.get("get_current_location")).toBeTruthy();
    expect(registry.get("report_product_bug")).toBeTruthy();
  });
});
