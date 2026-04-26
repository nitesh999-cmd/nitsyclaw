// Tool registry. Each P0 feature exposes one or more tools to Claude.

import { z } from "zod";

export interface ToolDefinition<I extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: I;
  handler: (input: z.infer<I>, ctx: ToolContext) => Promise<unknown>;
}

export interface ToolContext {
  userPhone: string;
  now: Date;
  timezone: string;
  /** Required dependencies are injected so tools never reach for globals. */
  deps: import("./deps.js").AgentDeps;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): this {
    if (this.tools.has(tool.name)) throw new Error(`Tool ${tool.name} already registered`);
    this.tools.set(tool.name, tool);
    return this;
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  all(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /** Convert to Anthropic tool-use schema. */
  toAnthropicTools(): Array<{ name: string; description: string; input_schema: unknown }> {
    return this.all().map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: zodToJsonSchema(t.inputSchema),
    }));
  }
}

/**
 * Minimal Zod → JSON Schema converter for tool input contracts.
 * Handles object/string/number/boolean/optional. Adequate for our tool shapes.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): unknown {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(val);
      if (!val.isOptional()) required.push(key);
    }
    return { type: "object", properties, required };
  }
  if (schema instanceof z.ZodString) return { type: "string" };
  if (schema instanceof z.ZodNumber) return { type: "number" };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return zodToJsonSchema(schema._def.innerType);
  }
  if (schema instanceof z.ZodEnum) {
    return { type: "string", enum: schema.options };
  }
  return {};
}
