import { getDb, memories } from "@nitsyclaw/shared/db";
import { assessMemoryQuality, formatMemoryQualityLabel } from "@nitsyclaw/shared/agent";
import { assertPublicSaleTenantBoundaries } from "@nitsyclaw/shared/tenancy";
import { desc, sql } from "drizzle-orm";
import { logDashboardLoadError } from "../../lib/dashboard-runtime";
import { likePatternForSearchTerm, normalizeSearchTerm } from "../../lib/search-query.js";

export const dynamic = "force-dynamic";

async function load(q?: string) {
  assertPublicSaleTenantBoundaries();
  const db = getDb();
  const term = normalizeSearchTerm(q);
  if (term) {
    const like = likePatternForSearchTerm(term);
    return db
      .select()
      .from(memories)
      .where(sql`lower(${memories.content}) LIKE ${like} ESCAPE '\'`)
      .orderBy(desc(memories.createdAt))
      .limit(100);
  }
  return db.select().from(memories).orderBy(desc(memories.createdAt)).limit(100);
}

export default async function MemoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; reviewed?: string; reviewError?: string }>;
}) {
  const params = await (searchParams ?? Promise.resolve({} as { q?: string; reviewed?: string; reviewError?: string }));
  const q = params.q?.trim() ?? "";

  let rows: Awaited<ReturnType<typeof load>> = [];
  let errorMsg: string | null = null;
  try {
    rows = await load(q);
  } catch (e) {
    logDashboardLoadError("memory", e);
    errorMsg = "Could not load memory. Try again shortly.";
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
  const reviewRows = rows
    .map((row) => ({ row, assessment: assessMemoryQuality(row.content, row.tags) }))
    .filter(({ assessment, row }) => assessment.action !== "keep" || !row.tags.includes("reviewed"))
    .slice(0, 12);

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

      {params.reviewed ? (
        <div className="mb-3 rounded-xl border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-200" role="status">
          Memory review saved.
        </div>
      ) : null}
      {params.reviewError ? (
        <div className="mb-3 rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-200" role="alert">
          Could not update that memory. Check the entry and try again.
        </div>
      ) : null}

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

      {reviewRows.length > 0 ? (
        <section className="nc-section">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="nc-eyebrow">Review inbox</div>
              <h3 className="mt-2 text-xl font-semibold text-slate-100">Memories needing a decision</h3>
              <p className="mt-2 text-sm text-slate-400">
                Pin what should stay, downgrade casual notes, edit weak wording, or expire facts that should not become long-term context.
              </p>
            </div>
            <span className="nc-pill">{reviewRows.length} to review</span>
          </div>
          <ul className="mt-4 space-y-3">
            {reviewRows.map(({ row, assessment }) => (
              <li key={`review-${row.id}`} className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded border border-amber-700 bg-amber-950/50 px-2 py-1 text-amber-100">
                    {assessment.action}
                  </span>
                  <span className="text-slate-400">{assessment.category.replace(/_/g, " ")}</span>
                  {assessment.reviewAfterDays ? (
                    <span className="text-slate-500">review in {assessment.reviewAfterDays}d</span>
                  ) : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-100">{row.content}</p>
                <p className="mt-2 text-xs leading-5 text-slate-400">{assessment.reasons.join(" ")}</p>
                <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_auto] lg:items-end">
                  <form action="/api/memory/review" method="post" className="grid gap-2">
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="action" value="edit" />
                    <label className="text-xs text-slate-500" htmlFor={`content-${row.id}`}>
                      Edit before keeping
                    </label>
                    <textarea
                      id={`content-${row.id}`}
                      name="content"
                      rows={2}
                      defaultValue={row.content}
                      className="nc-input w-full"
                    />
                    <button className="nc-button min-h-9 justify-center text-xs" type="submit">Save edit</button>
                  </form>
                  <div className="flex flex-wrap gap-2">
                    <MemoryReviewButton id={row.id} action="pin" label="Pin" />
                    <MemoryReviewButton id={row.id} action="downgrade" label="Downgrade" />
                    <MemoryReviewButton id={row.id} action="expire" label="Expire" danger />
                    <MemoryReviewButton id={row.id} action="delete" label="Delete" danger />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
              {r.content ? (
                <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2 text-xs leading-5 text-slate-400">
                  <div>
                    <span className="font-semibold text-slate-200">Quality:</span>{" "}
                    {formatMemoryQualityLabel(r.content, r.tags)}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-200">Review:</span>{" "}
                    {assessMemoryQuality(r.content, r.tags).reasons.join(" ")}
                  </div>
                </div>
              ) : null}
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

function MemoryReviewButton({
  id,
  action,
  label,
  danger = false,
}: {
  id: string;
  action: "pin" | "downgrade" | "expire" | "delete";
  label: string;
  danger?: boolean;
}) {
  return (
    <form action="/api/memory/review" method="post">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <button
        type="submit"
        className={
          danger
            ? "min-h-9 rounded-lg border border-red-800 px-3 text-xs text-red-200 transition hover:border-red-500 hover:bg-red-950/40"
            : "nc-button min-h-9 px-3 text-xs"
        }
      >
        {label}
      </button>
    </form>
  );
}
