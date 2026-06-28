// Feature 32: Orphan radar.
//
// Surfaces "things slipping" in one read: pending reminders due in the
// next 48h, snoozes due in the next 48h, and (if entities exist) person
// contacts not heard from in N days where there's an open thread.

import { z } from "zod";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { hashPhone } from "../utils/crypto.js";
import { reminders, snoozes, entities } from "../db/schema.js";
import { privateOwnerTenantForPhone } from "../tenancy.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";

interface OrphanItem {
  kind: "reminder" | "snooze" | "stale_contact";
  id: string;
  due?: string; // ISO when due / last touched
  preview: string;
}

export function registerOrphanRadar(registry: ToolRegistry): void {
  registry.register({
    name: "find_orphans",
    description:
      "Surface 'things slipping' for the user. Returns pending reminders + snoozes due in the next " +
      "windowHours (default 48), plus stale-contact warnings (people in the entity graph not " +
      "mentioned in N days). Use for 'what am I forgetting', 'anything slipping', morning brief " +
      "tail, evening close-out tail.",
    inputSchema: z.object({
      windowHours: z.number().int().min(1).max(168).optional(),
      staleContactDays: z.number().int().min(1).max(90).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    handler: async (
      input: { windowHours?: number; staleContactDays?: number; limit?: number },
      ctx: ToolContext,
    ) => {
      const ownerHash = hashPhone(ctx.userPhone);
      const now = ctx.now;
      const windowHours = input.windowHours ?? 48;
      const staleDays = input.staleContactDays ?? 7;
      const limit = Math.min(input.limit ?? 10, 30);
      const tenantOk = privateOwnerTenantForPhone(ctx.userPhone);
      void tenantOk; // throws if tenant resolution fails

      const windowEnd = new Date(now.getTime() + windowHours * 60 * 60 * 1000);

      const [dueReminders, dueSnoozes] = await Promise.all([
        ctx.deps.db
          .select()
          .from(reminders)
          .where(
            and(
              eq(reminders.status, "pending"),
              gte(reminders.fireAt, now),
              lte(reminders.fireAt, windowEnd),
            ),
          )
          .orderBy(asc(reminders.fireAt))
          .limit(limit),
        ctx.deps.db
          .select()
          .from(snoozes)
          .where(
            and(
              eq(snoozes.ownerHash, ownerHash),
              eq(snoozes.status, "pending"),
              gte(snoozes.resurfaceAt, now),
              lte(snoozes.resurfaceAt, windowEnd),
            ),
          )
          .orderBy(asc(snoozes.resurfaceAt))
          .limit(limit),
      ]);

      // Stale contacts: most recent person entity per normalized_value, then
      // filter where last-seen older than staleDays. Done in JS to keep the
      // fake DB happy.
      const personRows = await ctx.deps.db
        .select()
        .from(entities)
        .where(and(eq(entities.ownerHash, ownerHash), eq(entities.kind, "person")))
        .orderBy(desc(entities.sourceAt))
        .limit(200);

      const staleThreshold = new Date(now.getTime() - staleDays * 24 * 60 * 60 * 1000);
      const lastSeenByContact = new Map<string, { id: string; at: Date; value: string }>();
      for (const e of personRows) {
        if (!e.normalizedValue || e.normalizedValue.startsWith("__none__")) continue;
        const at = e.sourceAt ?? e.createdAt;
        if (!lastSeenByContact.has(e.normalizedValue)) {
          lastSeenByContact.set(e.normalizedValue, { id: e.id, at, value: e.value });
        }
      }
      const staleContacts = Array.from(lastSeenByContact.values())
        .filter((c) => c.at < staleThreshold)
        .sort((a, b) => a.at.getTime() - b.at.getTime())
        .slice(0, limit);

      const items: OrphanItem[] = [];
      for (const r of dueReminders) {
        items.push({
          kind: "reminder",
          id: r.id,
          due: r.fireAt.toISOString(),
          preview: r.text.slice(0, 140),
        });
      }
      for (const s of dueSnoozes) {
        items.push({
          kind: "snooze",
          id: s.id,
          due: s.resurfaceAt.toISOString(),
          preview: (s.sourceHint ?? s.content).slice(0, 140),
        });
      }
      for (const c of staleContacts) {
        items.push({
          kind: "stale_contact",
          id: c.id,
          due: c.at.toISOString(),
          preview: `${c.value} — last mention ${Math.round(
            (now.getTime() - c.at.getTime()) / (24 * 60 * 60 * 1000),
          )}d ago`,
        });
      }

      return {
        windowHours,
        staleContactDays: staleDays,
        count: items.length,
        items: items.slice(0, limit),
      };
    },
  });
}
