// Feature 11: Feature request capture.
//
// User says on WhatsApp/dashboard: "add a feature: voice in on /chat"
// (or "I want NitsyClaw to do X", "feature request: Y", etc.)
// Model picks this tool, persists to feature_requests table.
// A scheduled CCR routine ("NitsyClaw build agent") runs daily, queries
// pending rows, runs NWP, implements, commits, pushes, marks done, and
// notifies the user back via the messages table.

import { z } from "zod";
import { insertFeatureRequest } from "../db/repo.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";
import type { Surface } from "../agent/system-prompt.js";

export interface FeatureRequestRegisterOpts {
  surface: Surface;
}

export function registerFeatureRequest(
  registry: ToolRegistry,
  opts: FeatureRequestRegisterOpts,
): void {
  registry.register({
    name: "request_feature",
    description:
      "Queue a NEW NitsyClaw feature request from the user. Use when the user says 'add a feature', 'I want NitsyClaw to do X', 'feature request: Y', 'can you build me Z', or any similar new-capability ask. The request is persisted and the daily build agent (runs at 12:00 UTC = 22:00 Sydney) will pick it up, run NWP, implement, push, and notify you back. Do NOT use this for bug reports about existing features (just fix those) or for one-off requests like 'remind me to X' (use set_reminder).",
    inputSchema: z.object({
      description: z
        .string()
        .min(5)
        .describe(
          "Self-contained description: WHAT the feature does, WHERE it lives (WhatsApp / dashboard / both), and the SUCCESS CRITERION the build agent should verify. Example: 'On the dashboard /chat page, add a microphone button that uses Web Speech API to capture voice and put the transcript into the input. Success: tapping mic on Chrome desktop and speaking populates the input field.'",
        ),
      size: z
        .enum(["S", "M", "L"])
        .optional()
        .default("M")
        .describe(
          "S = under 30 min, self-contained single-file. M = 30 min to 2 hr, multi-file but single surface. L = over 2 hr or touches multiple surfaces / DB schema / new external service.",
        ),
    }),
    handler: async (
      input: { description: string; size?: "S" | "M" | "L" },
      ctx: ToolContext,
    ) => {
      const row = await insertFeatureRequest(ctx.deps.db, {
        description: input.description,
        size: input.size ?? "M",
        source: opts.surface,
        requestedBy: ctx.userPhone,
      });
      return {
        id: row.id,
        status: row.status,
        size: row.size,
        eta: "Daily build agent runs at 12:00 UTC (22:00 Australia/Sydney). You can also trigger it sooner from claude.ai/code/routines.",
      };
    },
  });
}
