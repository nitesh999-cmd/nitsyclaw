import { getDb, memories } from "@nitsyclaw/shared/db";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  let rows: Awaited<ReturnType<typeof load>> = [];
  let errorMsg: string | null = null;
  try {
    rows = await load();
  } catch (e: unknown) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  if (errorMsg) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Memory</h2>
        <div className="p-4 bg-red-950/40 border border-red-900 rounded text-sm">
          <p className="font-medium text-red-300">Database error</p>
          <pre className="text-xs text-red-400 mt-2 whitespace-pre-wrap">{errorMsg}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Memory</h2>
      <p className="text-xs text-neutral-500">
        {rows.length} entries. Long-term notes, facts, and pinned info.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No memories yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="p-4 bg-neutral-900 border border-neutral-800 rounded"
            >
              <div className="flex items-center gap-2 mb-2 text-xs">
                <span className="px-2 py-0.5 bg-neutral-800 rounded text-neutral-300 uppercase tracking-wide">
                  {r.kind}
                </span>
                <span className="text-neutral-500">{new Date(r.createdAt).toLocaleString()}</span>
              </div>
              <div className="text-sm text-neutral-100 whitespace-pre-wrap">
                {r.content && r.content.trim().length > 0 ? r.content : <span className="text-neutral-500 italic">(empty)</span>}
              </div>
              {r.tags && r.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.tags.map((t) => (
                    <span key={t} className="text-xs px-1.5 py-0.5 bg-neutral-800 text-neutral-400 rounded">
                      {t}
                    </span>
                  ))}
                </div>
              )}
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
