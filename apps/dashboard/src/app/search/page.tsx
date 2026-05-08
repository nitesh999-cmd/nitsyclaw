import { getDb, memories, reminders, messages } from "@nitsyclaw/shared/db";
import { desc, sql } from "drizzle-orm";
import { logDashboardError } from "../../lib/dashboard-runtime";
import { likePatternForSearchTerm, normalizeSearchTerm } from "../../lib/search-query";

export const dynamic = "force-dynamic";

type SearchResultType = "memory" | "reminder" | "message";

interface SearchResult {
  type: SearchResultType;
  id: string;
  summary: string;
  createdAt: string;
}

const TYPE_BADGE: Record<SearchResultType, string> = {
  memory: "bg-indigo-900/60 text-indigo-300 border border-indigo-700/50",
  reminder: "bg-amber-900/60 text-amber-300 border border-amber-700/50",
  message: "bg-emerald-900/60 text-emerald-300 border border-emerald-700/50",
};

async function searchAll(term: string): Promise<SearchResult[]> {
  const q = likePatternForSearchTerm(term);
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
      .where(sql`lower(${memories.content}) LIKE ${q} ESCAPE '\'`)
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
        sql`${reminders.status} = 'pending' AND lower(${reminders.text}) LIKE ${q} ESCAPE '\'`,
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

  return [
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
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string | string[] }>;
}) {
  const params = await (searchParams ?? Promise.resolve({ q: undefined }));
  const q = normalizeSearchTerm(params.q);

  let results: SearchResult[] = [];
  let searchError: string | null = null;

  if (q) {
    try {
      results = await searchAll(q);
    } catch (e) {
      logDashboardError("search.page", e);
      searchError = "Search failed. Try again shortly.";
    }
  }

  const grouped = results.reduce<Record<SearchResultType, SearchResult[]>>(
    (acc, r) => {
      acc[r.type].push(r);
      return acc;
    },
    { memory: [], reminder: [], message: [] },
  );

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow text-[#d8b75d]">Search</div>
        <h2 className="mt-2 text-3xl font-semibold">Find anything</h2>
        <p className="mt-3 text-sm text-slate-400">
          Search across memories, reminders, and messages.
        </p>
      </section>

      <section className="nc-section">
        <form method="GET" action="/search" className="flex gap-3">
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="memories, reminders, messages..."
            className="nc-input flex-1"
            autoFocus
          />
          <button type="submit" className="nc-button-primary">
            Search
          </button>
        </form>
      </section>

      {searchError && (
        <div className="border border-red-900 bg-red-950/40 p-4 text-sm">
          <p className="font-medium text-red-300">Search error</p>
          <p className="mt-2 text-xs text-red-400">{searchError}</p>
        </div>
      )}

      {!q && !searchError && (
        <section className="nc-section">
          <p className="nc-muted">Enter a search term above to find memories, reminders, and messages.</p>
        </section>
      )}

      {q && !searchError && results.length === 0 && (
        <section className="nc-section">
          <p className="nc-muted">No results for &ldquo;{q}&rdquo;.</p>
        </section>
      )}

      {q && !searchError && results.length > 0 && (
        <section className="nc-section space-y-6">
          <p className="text-xs text-slate-500">
            {results.length} result{results.length !== 1 ? "s" : ""} for &ldquo;{q}&rdquo;
          </p>

          {(["memory", "reminder", "message"] as SearchResultType[]).map((type) => {
            const group = grouped[type];
            if (group.length === 0) return null;
            return (
              <div key={type}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                  {type}s
                </h3>
                <ul className="space-y-2">
                  {group.map((r) => (
                    <li
                      key={r.id}
                      className="nc-tile bg-slate-800/50 border-slate-700 flex items-start gap-3"
                    >
                      <span
                        className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[r.type]}`}
                      >
                        {r.type}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-100 truncate">{r.summary}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {new Date(r.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
