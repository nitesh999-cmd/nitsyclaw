// Feature 11: Feature request capture.
//
// User says on WhatsApp/dashboard: "add a feature: voice in on /chat"
// (or "I want NitsyClaw to do X", "feature request: Y", etc.)
// Model picks this tool, persists to feature_requests table.
// A scheduled CCR routine ("NitsyClaw build agent") runs daily, queries
// pending rows, runs NWP, implements, commits, pushes, marks done, and
// notifies the user back via the messages table.

import { z } from "zod";
import {
  insertFeatureRequest,
  listPendingFeatureRequests,
  listRecentFeatureRequestsByStatus,
} from "../db/repo.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";
import type { Surface } from "../agent/system-prompt.js";
import { hashPhone } from "../utils/crypto.js";

export interface FeatureRequestRegisterOpts {
  surface: Surface;
}

export function registerFeatureRequest(
  registry: ToolRegistry,
  opts: FeatureRequestRegisterOpts,
): void {
  registry.register({
    name: "list_feature_queue_status",
    description:
      "Read the live NitsyClaw feature/bug queue status from the database. Use before answering questions about pending features, shipped features, queue count, what is left, or what has been added.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(10).optional().default(5),
    }),
    handler: async (input: { limit?: number }, ctx: ToolContext) => {
      const limit = input.limit ?? 5;
      const pending = await listPendingFeatureRequests(ctx.deps.db);
      const completed = await listRecentFeatureRequestsByStatus(ctx.deps.db, "done", limit);
      const topPending = pending.slice(0, limit).map((row) => ({
        id: row.id,
        shortId: row.id.slice(0, 8),
        type: row.type,
        size: row.size,
        description: row.description,
        source: row.source,
        createdAt: row.createdAt,
      }));
      const recentCompleted = completed.map((row) => ({
        id: row.id,
        shortId: row.id.slice(0, 8),
        type: row.type,
        size: row.size,
        description: row.description,
        source: row.source,
        completedAt: row.completedAt,
        implementationNotes: row.implementationNotes,
      }));

      return {
        pendingCount: pending.length,
        topPending,
        recentCompleted,
        guidance:
          "Answer from these live rows only. Do not say 'nothing has shipped' unless recentCompleted is empty and you explicitly say you only checked recent completed rows.",
      };
    },
  });

  registry.register({
    name: "request_feature",
    description:
      "Queue a NEW NitsyClaw feature request from the user. Use when the user says 'add a feature', 'I want NitsyClaw to do X', 'feature request: Y', 'can you build me Z', or any similar new-capability ask. The request is persisted and the build agent will review it on the next run. Do NOT use this for bug reports about existing features (use report_product_bug) or for one-off requests like 'remind me to X' (use set_reminder).",
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
        type: "feature",
        size: input.size ?? "M",
        source: opts.surface,
        requestedBy: hashPhone(ctx.userPhone),
      });
      return {
        id: row.id,
        status: row.status,
        size: row.size,
        eta: "Queued in NitsyClaw. The operator queue can review and implement it through the local build workflow.",
      };
    },
  });
}
