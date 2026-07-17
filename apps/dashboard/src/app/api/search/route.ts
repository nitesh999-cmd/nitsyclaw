import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, memories, reminders, messages } from "@nitsyclaw/shared/db";
import { getOwnerIdentity, logDashboardError } from "../../../lib/dashboard-runtime";
import { blockPublicSaleCustomerDataAccess } from "../../../lib/public-sale-data-guard";
import { likePatternForSearchTerm, normalizeSearchTerm } from "../../../lib/search-query";
import { requireSameOrigin } from "../../../lib/request-origin";
import { requireDashboardSession } from "../../../lib/require-dashboard-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
type SearchResultType = "memory" | "reminder" | "message";

interface SearchResult {
  type: SearchResultType;
  id: string;
  summary: string;
  createdAt: string;
}

export async function GET(req: Request): Promise<Response> {
  const originError = requireSameOrigin(req);
  if (originError) return originError;
  const sessionError = await requireDashboardSession(req);
  if (sessionError) return sessionError;

  const { searchParams } = new URL(req.url);
  const term = normalizeSearchTerm(searchParams.get("q"));

  if (!term || term.length === 0) {
    return NextResponse.json(
      { error: "Missing required query parameter: q" },
      { status: 400, headers: NO_STORE },
    );
  }

  const saleModeBlock = blockPublicSaleCustomerDataAccess();
  if (saleModeBlock) return saleModeBlock;

  try {
    const q = likePatternForSearchTerm(term);
    const db = getDb();
    const { ownerHash } = getOwnerIdentity();

    const [memoryRows, reminderRows, messageRows] = await Promise.all([
      db
        .select({
          id: memories.id,
          kind: memories.kind,
          content: memories.content,
          createdAt: memories.createdAt,
        })
        .from(memories)
        .where(and(eq(memories.ownerHash, ownerHash), sql`lower(${memories.content}) LIKE ${q} ESCAPE '\'`))
        .orderBy(desc(memories.createdAt))
        .limit(8),

      db
        .select({
          id: reminders.id,
          text: reminders.text,
          createdAt: reminders.createdAt,
        })
        .from(reminders)
        .where(
          and(
            eq(reminders.ownerHash, ownerHash),
            sql`${reminders.status} = 'pending' AND lower(${reminders.text}) LIKE ${q} ESCAPE '\'`,
          ),
        )
        .orderBy(desc(reminders.createdAt))
        .limit(8),

      db
        .select({
          id: messages.id,
          intent: messages.intent,
          direction: messages.direction,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(sql`${messages.intent} IS NOT NULL AND lower(${messages.intent}) LIKE ${q} ESCAPE '\'`)
        .orderBy(desc(messages.createdAt))
        .limit(8),
    ]);

    const results: SearchResult[] = [
      ...memoryRows.map((r) => ({
        type: "memory" as const,
        id: r.id,
        summary: `[${r.kind}] ${r.content.slice(0, 100)}`,
        createdAt: r.createdAt.toISOString(),
      })),
      ...reminderRows.map((r) => ({
        type: "reminder" as const,
        id: r.id,
        summary: r.text,
        createdAt: r.createdAt.toISOString(),
      })),
      ...messageRows.map((r) => ({
        type: "message" as const,
        id: r.id,
        summary: `[${r.direction}] ${r.intent ?? ""}`,
        createdAt: r.createdAt.toISOString(),
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({ results }, { headers: NO_STORE });
  } catch (e) {
    logDashboardError("search.api", e);
    return NextResponse.json(
      { error: "Search failed. Try again shortly." },
      { status: 500, headers: NO_STORE },
    );
  }
}
