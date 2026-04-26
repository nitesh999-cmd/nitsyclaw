// Feature 7: Schedule a call — calendar write.
// Always goes through the confirmation rail (Feature 9) for safety.

import { z } from "zod";
import { addMinutes } from "../utils/time.js";
import { insertConfirmation } from "../db/repo.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";

export function registerScheduleCall(registry: ToolRegistry): void {
  registry.register({
    name: "schedule_call",
    description:
      "Propose a calendar event with a participant. Returns a pending confirmation id; the user must reply 'y' before it is created.",
    inputSchema: z.object({
      title: z.string().min(1),
      participantEmail: z.string().email(),
      durationMin: z.number().int().min(15).max(240).default(30),
      windowStartIso: z.string().describe("ISO timestamp; earliest acceptable start"),
      windowEndIso: z.string().describe("ISO timestamp; latest acceptable start"),
    }),
    handler: async (
      input: {
        title: string;
        participantEmail: string;
        durationMin: number;
        windowStartIso: string;
        windowEndIso: string;
      },
      ctx: ToolContext,
    ) => {
      const start = new Date(input.windowStartIso);
      const end = new Date(input.windowEndIso);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new Error("invalid window timestamps");
      if (end <= start) throw new Error("window end must be after start");

      const slots = await ctx.deps.calendar.suggestSlots({
        durationMin: input.durationMin,
        participants: [input.participantEmail],
        window: { start, end },
      });
      if (slots.length === 0) throw new Error("no slots found in window");
      const chosen = slots[0]!;

      const conf = await insertConfirmation(
        ctx.deps.db,
        "create_calendar_event",
        {
          title: input.title,
          start: chosen.toISOString(),
          durationMin: input.durationMin,
          participants: [input.participantEmail],
        },
        addMinutes(ctx.now, 30),
      );

      // Inform the user — confirmation is closed by Feature 9 when they reply.
      await ctx.deps.whatsapp.send({
        to: ctx.userPhone,
        body:
          `Found: ${input.title} with ${input.participantEmail}\n` +
          `Slot: ${chosen.toISOString()}\n` +
          `Reply 'y' (within 30 min) to create or 'n' to cancel.\n` +
          `Confirmation id: ${conf.id}`,
      });

      return { confirmationId: conf.id, proposedStart: chosen.toISOString() };
    },
  });
}
