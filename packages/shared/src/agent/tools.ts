// Tool registry. Each P0 feature exposes one or more tools to Claude.

import { z } from "zod";

/**
 * What a tool is willing to have written to the durable audit trail.
 *
 * Runtime results and persisted records are deliberately different objects: the
 * agent and the verified-source collector need the complete result in memory,
 * while `audit_log` must hold only non-identifying scalars. A tool opts in by
 * projecting; without a projection nothing is persisted.
 */
export interface ToolAuditProjection {
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
}

export interface ToolDefinition<I extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: I;
  handler: (input: z.infer<I>, ctx: ToolContext) => Promise<unknown>;
  /**
   * Optional narrowing of what reaches `audit_log`. Receives the runtime input
   * and output and returns only the fields safe to persist. Omit it and the
   * tool records an empty input and output — never an arbitrary object.
   */
  auditProjection?: (io: { input: unknown; output: unknown }) => ToolAuditProjection;
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

  /**
   * A copy of this registry with the named tools withheld.
   *
   * Lets one turn run without a tool while leaving the shared registry — and
   * therefore every other turn — untouched. Tool definitions are shared by
   * reference; only the lookup table differs.
   */
  without(...names: string[]): ToolRegistry {
    const withheld = new Set(names);
    const copy = new ToolRegistry();
    for (const tool of this.all()) {
      if (!withheld.has(tool.name)) copy.register(tool);
    }
    return copy;
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
  if (schema instanceof z.ZodArray) {
    return { type: "array", items: zodToJsonSchema(schema.element) };
  }
  return {};
}
