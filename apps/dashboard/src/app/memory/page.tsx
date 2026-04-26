import { getDb, memories } from "@nitsyclaw/shared/db";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  let rows: Awaited<ReturnType<typeof load>> = [];
  try { rows = await load(); } catch { return <p className="text-sm text-neutral-500">DB not configured.</p>; }
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Memory</h2>
      <ul className="space-y-3" data-testid="memory-list">
        {rows.map((m) => (
          <li key={m.id} className="border border-neutral-800 rounded p-3">
            <div className="text-xs text-neutral-500 mb-1">
              {m.kind} · {new Date(m.createdAt).toLocaleString()} · {m.tags.join(", ") || "no tags"}
            </div>
            <div className="text-sm">{m.content}</div>
          </li>
        ))}
        {rows.length === 0 && <p className="text-sm text-neutral-500">No memories yet.</p>}
      </ul>
    </div>
  );
}

async function load() {
  const db = getDb();
  return db.select().from(memories).orderBy(desc(memories.createdAt)).limit(50);
}
