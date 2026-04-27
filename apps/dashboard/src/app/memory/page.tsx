import { getDb, memories } from "@nitsyclaw/shared/db";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  let rows: Awaited<ReturnType<typeof load>> = [];
  try {
    rows = await load();
  } catch (e: any) {
    console.error("[Memory] DB error:", e);
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Memory</h1>
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-sm font-medium text-red-900">Database error</p>
          <pre className="text-xs text-red-700 mt-2 whitespace-pre-wrap">{e?.message ?? String(e)}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Memory</h1>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No memories yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="p-3 bg-white border rounded">
              <div className="text-xs text-neutral-500 mb-1">{r.kind}</div>
              <div className="text-sm">{r.content}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function load() {
  const db = getDb();
  return db.select().from(memories).orderBy(desc(memories.createdAt)).limit(100);
}