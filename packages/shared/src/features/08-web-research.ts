// Feature 8: Web research — "look up X and send me a 3-line summary."

import { z } from "zod";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";

const SYSTEM_SUMMARY =
  "Summarize the supplied search results in exactly three short lines. " +
  "Each line under 25 words. No preamble, no markdown bullets — just three lines separated by newlines.";

export async function summarizeResults(args: {
  query: string;
  results: Array<{ title: string; url: string; snippet: string }>;
  llm: import("../agent/deps.js").LlmClient;
}): Promise<string> {
  if (args.results.length === 0) return "No results found.";
  const corpus = args.results
    .slice(0, 5)
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\n${r.url}`)
    .join("\n\n");
  const { text } = await args.llm.complete({
    system: SYSTEM_SUMMARY,
    messages: [{ role: "user", content: `Query: ${args.query}\n\nResults:\n${corpus}` }],
    maxTokens: 200,
  });
  return text.trim();
}

export function registerWebResearch(registry: ToolRegistry): void {
  registry.register({
    name: "web_research",
    description: "Search the web for a query and return a 3-line summary plus top 3 source URLs.",
    inputSchema: z.object({
      query: z.string().min(2),
    }),
    handler: async (input: { query: string }, ctx: ToolContext) => {
      const results = await ctx.deps.webSearch.search(input.query);
      const summary = await summarizeResults({ query: input.query, results, llm: ctx.deps.llm });
      return {
        summary,
        sources: results.slice(0, 3).map((r) => ({ title: r.title, url: r.url })),
      };
    },
  });
}
