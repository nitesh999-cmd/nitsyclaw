import { NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { getDb, memories, reminders, messages } from "@nitsyclaw/shared/db";

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
  const { searchParams } = new URL(req.url);
  const term = searchParams.get("q");

  if (!term || term.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing required query parameter: q" },
      { status: 400, headers: NO_STORE },
    );
  }

  const q = `%${term.toLowerCase()}%`;
  const db = getDb();

  const [memoryRows, reminderRows, messageRows] = await Promise.all([
    db
      .select({
        id: memories.id,
        kind: memories.kind,
        content: memories.content,
        createdAt: memories.createdAt,
      })
      .from(memories)
      .where(sql`lower(${memories.content}) LIKE ${q}`)
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
        sql`${reminders.status} = 'pending' AND lower(${reminders.text}) LIKE ${q}`,
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
      .where(sql`${messages.intent} IS NOT NULL AND lower(${messages.intent}) LIKE ${q}`)
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
}
