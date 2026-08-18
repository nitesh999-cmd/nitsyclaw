import { auditToolFailure, auditToolSuccess, auditUnknownTool } from "../db/audit-contract.js";
import { logAudit, redactAuditString } from "../db/repo.js";
import type { AgentDeps } from "./deps.js";
import { classifyToolError } from "./tool-error.js";
import type { ToolContext, ToolDefinition, ToolRegistry } from "./tools.js";

/**
 * What this tool call may persist.
 *
 * Runtime data and audit data are separate by construction: the caller keeps the
 * complete result, while only a tool's own projection reaches `audit_log`. A
 * tool without a projection records nothing, so a new or third-party tool can
 * never leak an arbitrary object into durable storage.
 */
export function projectForAudit(
  tool: ToolDefinition | undefined,
  input: unknown,
  output: unknown,
): { input: Record<string, unknown>; output: Record<string, unknown> } {
  if (!tool?.auditProjection) return { input: {}, output: {} };
  try {
    const projected = tool.auditProjection({ input, output });
    return { input: projected.input ?? {}, output: projected.output ?? {} };
  } catch {
    // A throwing projection must not become a leak or a failed turn.
    return { input: {}, output: {} };
  }
}

const MAX_TOOL_RESULT_TEXT_CHARS = 2_000;
const MAX_TOOL_ERROR_TEXT_CHARS = 240;

export interface AgentRunArgs {
  userPhone: string;
  userMessage: string;
  /** prior turns, oldest → newest */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  systemPrompt: string;
  registry: ToolRegistry;
  deps: AgentDeps;
  /** safety cap on tool-use rounds */
  maxRounds?: number;
}

export interface AgentRunResult {
  finalText: string;
  rounds: number;
  toolCalls: Array<{ name: string; input: unknown; output: unknown; success: boolean; error?: string }>;
}

/**
 * Standard tool-use loop. Each round:
 *   1. send messages + tools to LLM
 *   2. if stop_reason === 'tool_use', execute every tool call and append results
 *   3. else return text
 */
export async function runAgent(args: AgentRunArgs): Promise<AgentRunResult> {
  const max = args.maxRounds ?? 6;
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...(args.history ?? []),
    { role: "user", content: args.userMessage },
  ];
  const calls: AgentRunResult["toolCalls"] = [];
  let rounds = 0;

  while (rounds < max) {
    rounds++;
    const step = await args.deps.llm.toolStep({
      system: args.systemPrompt,
      messages,
      tools: args.registry.toAnthropicTools(),
    });

    if (step.stopReason !== "tool_use" || step.toolCalls.length === 0) {
      return { finalText: step.text, rounds, toolCalls: calls };
    }

    // Execute all tool calls in this round
    const ctx: ToolContext = {
      userPhone: args.userPhone,
      now: args.deps.now(),
      timezone: args.deps.timezone,
      deps: args.deps,
    };
    const toolResultParts: string[] = [];
    for (const call of step.toolCalls) {
      const tool = args.registry.get(call.name);
      const started = Date.now();
      if (!tool) {
        const err = formatToolErrorText(`unknown tool: ${call.name}`);
        calls.push({ name: call.name, input: call.input, output: null, success: false, error: err });
        toolResultParts.push(`[tool ${call.name}] error: ${err}`);
        // Unknown tool: nothing is known to be safe, so nothing is persisted.
        // `err` still reaches the model and the caller; only the audit row is
        // reduced to a structured class.
        await logAudit(args.deps.db, auditUnknownTool());
        continue;
      }
      try {
        const parsed = tool.inputSchema.safeParse(call.input);
        if (!parsed.success) throw new Error(parsed.error.message);
        const out = await tool.handler(parsed.data, ctx);
        calls.push({ name: call.name, input: call.input, output: out, success: true });
        toolResultParts.push(`[tool ${call.name}] ${formatToolResultText(out)}`);
        await logAudit(
          args.deps.db,
          auditToolSuccess({
            tool: tool.name,
            projected: projectForAudit(tool, call.input, out),
            durationMs: Date.now() - started,
          }),
        );
      } catch (e) {
        const err = formatToolErrorText(e);
        calls.push({ name: call.name, input: call.input, output: null, success: false, error: err });
        toolResultParts.push(`[tool ${call.name}] error: ${err}`);
        // `err` is sanitized free text: fine for the model and the operational
        // log, never for durable storage. Only structured metadata persists.
        await logAudit(
          args.deps.db,
          auditToolFailure({
            tool: tool.name,
            projectedInput: projectForAudit(tool, call.input, undefined).input,
            errorAudit: classifyToolError(tool.errorProjection, call.input, e),
            durationMs: Date.now() - started,
          }),
        );
      }
    }
    // Feed results back as a synthetic user turn so the model can react.
    // (Real Anthropic tool-use uses a structured tool_result block; this is a simplification
    //  that the LlmClient impl translates into the proper format.)
    messages.push({ role: "assistant", content: step.text });
    messages.push({ role: "user", content: `Tool results:\n${toolResultParts.join("\n")}` });
  }

  return { finalText: "[agent] hit max rounds", rounds, toolCalls: calls };
}

export function formatToolErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const redacted = redactAuditString(message);
  return redacted.length > MAX_TOOL_ERROR_TEXT_CHARS
    ? `${redacted.slice(0, MAX_TOOL_ERROR_TEXT_CHARS)}...[truncated]`
    : redacted;
}

function formatToolResultText(value: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    text = JSON.stringify({ error: "Tool result could not be serialized" });
  }

  if (text.length <= MAX_TOOL_RESULT_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_TOOL_RESULT_TEXT_CHARS)}...[truncated ${text.length - MAX_TOOL_RESULT_TEXT_CHARS} chars]`;
}
