import { logAudit } from "../db/repo.js";
import type { AgentDeps } from "./deps.js";
import type { ToolContext, ToolRegistry } from "./tools.js";

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
        const err = `unknown tool: ${call.name}`;
        calls.push({ name: call.name, input: call.input, output: null, success: false, error: err });
        toolResultParts.push(`[tool ${call.name}] error: ${err}`);
        await logAudit(args.deps.db, { actor: "agent", tool: call.name, input: call.input, success: false, error: err });
        continue;
      }
      try {
        const parsed = tool.inputSchema.safeParse(call.input);
        if (!parsed.success) throw new Error(parsed.error.message);
        const out = await tool.handler(parsed.data, ctx);
        calls.push({ name: call.name, input: call.input, output: out, success: true });
        toolResultParts.push(`[tool ${call.name}] ${JSON.stringify(out)}`);
        await logAudit(args.deps.db, {
          actor: "agent",
          tool: call.name,
          input: call.input as Record<string, unknown>,
          output: out as Record<string, unknown>,
          success: true,
          durationMs: Date.now() - started,
        });
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        calls.push({ name: call.name, input: call.input, output: null, success: false, error: err });
        toolResultParts.push(`[tool ${call.name}] error: ${err}`);
        await logAudit(args.deps.db, {
          actor: "agent",
          tool: call.name,
          input: call.input as Record<string, unknown>,
          success: false,
          error: err,
          durationMs: Date.now() - started,
        });
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
