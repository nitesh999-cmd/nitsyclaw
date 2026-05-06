import { getDb, memories } from "@nitsyclaw/shared/db";
import { desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function load(q?: string) {
  const db = getDb();
  if (q && q.trim()) {
    const like = `%${q.toLowerCase()}%`;
    return db
      .select()
      .from(memories)
      .where(sql`lower(${memories.content}) LIKE ${like}`)
      .orderBy(desc(memories.createdAt))
      .limit(100);
  }
  return db.select().from(memories).orderBy(desc(memories.createdAt)).limit(100);
}

export default async function MemoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const params = await (searchParams ?? Promise.resolve({} as { q?: string }));
  const q = params.q?.trim() ?? "";

  let rows: Awaited<ReturnType<typeof load>> = [];
  let errorMsg: string | null = null;
  try {
    rows = await load(q);
  } catch {
    errorMsg = "Could not load memory. Check Health.";
  }

  if (errorMsg) {
    return (
      <div className="nc-page">
        <section className="nc-hero">
          <div className="nc-eyebrow">Long-term context</div>
          <h2 className="mt-2 text-3xl font-semibold">Memory</h2>
        </section>
        <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm">
          <p className="font-medium text-red-300">Memory unavailable</p>
          <p className="mt-2 text-xs text-red-400">{errorMsg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Long-term context</div>
        <h2 className="mt-2 text-3xl font-semibold">Memory</h2>
        <p className="mt-3 text-sm text-slate-400">
          {q
            ? `${rows.length} result${rows.length !== 1 ? "s" : ""} for "${q}"`
            : `${rows.length} entries. Long-term notes, facts, and pinned info.`}
        </p>
      </section>

      <section className="nc-section">
        <form method="GET" action="/memory" className="flex gap-3">
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search memories..."
            className="nc-input flex-1"
          />
          <button type="submit" className="nc-button-primary">Search</button>
          {q && <a href="/memory" className="nc-button">Clear</a>}
        </form>
      </section>

      {rows.length === 0 ? (
        <section className="nc-section">
          <p className="nc-muted">{q ? `No memories match "${q}".` : "No memories yet."}</p>
        </section>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="nc-tile">
              <div className="flex items-center gap-2 mb-2 text-xs">
                <span className="nc-pill uppercase tracking-wide">{r.kind}</span>
                <span className="text-slate-500">{new Date(r.createdAt).toLocaleString()}</span>
              </div>
              <div className="text-sm text-slate-100 whitespace-pre-wrap">
                {r.content && r.content.trim().length > 0 ? r.content : <span className="text-slate-500 italic">(empty)</span>}
              </div>
              {r.tags && r.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.tags.map((t) => (
                    <span key={t} className="nc-pill min-h-6">{t}</span>
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
