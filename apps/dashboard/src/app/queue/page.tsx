import { getDb, featureRequests } from "@nitsyclaw/shared/db";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function loadQueue(status?: string) {
  const db = getDb();
  if (status && ["pending", "in_progress", "done", "rejected"].includes(status)) {
    return db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.status, status as "pending" | "in_progress" | "done" | "rejected"))
      .orderBy(desc(featureRequests.createdAt))
      .limit(100);
  }
  return db.select().from(featureRequests).orderBy(desc(featureRequests.createdAt)).limit(100);
}

async function loadQueueCounts() {
  const db = getDb();
  const rows = await db.select({ status: featureRequests.status }).from(featureRequests).limit(1000);
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
}

function badge(status: string) {
  const cls =
    status === "done"
      ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-300"
      : status === "in_progress"
        ? "border-sky-500/40 bg-sky-950/30 text-sky-300"
        : status === "rejected"
          ? "border-red-500/40 bg-red-950/30 text-red-300"
          : "border-slate-700 bg-slate-800 text-slate-300";
  return `nc-pill ${cls}`;
}

function severityColor(severity: string | null) {
  if (!severity) return "text-slate-500";
  if (severity === "P0" || severity === "critical") return "text-red-400";
  if (severity === "P1") return "text-orange-400";
  if (severity === "P2") return "text-amber-400";
  return "text-slate-500";
}

export default async function QueuePage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  let rows: Awaited<ReturnType<typeof loadQueue>> = [];
  let counts: Record<string, number> = {};
  let error: string | null = null;
  const params = searchParams ? await searchParams : undefined;
  try {
    [rows, counts] = await Promise.all([loadQueue(params?.status), loadQueueCounts()]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const activeStatus = params?.status && ["pending", "in_progress", "done", "rejected"].includes(params.status)
    ? params.status
    : "all";

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="nc-eyebrow">Home requests</div>
            <h2 className="mt-2 text-3xl font-semibold">Feature Queue</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Requests captured from WhatsApp and the dashboard. Use <code className="text-[#d8b75d]">/addfeature your idea</code> to add one.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {["pending", "in_progress", "done", "rejected"].map((status) => (
              <a key={status} href={`/queue?status=${status}`} className="nc-tile min-w-28 p-3 hover:border-[#d8b75d]/40 transition-colors">
                <div className="nc-eyebrow">{status.replace("_", " ")}</div>
                <div className="mt-2 text-2xl font-semibold text-slate-100">{counts[status] ?? 0}</div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-200" role="alert">
          Queue is unavailable right now.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 text-sm">
        {["all", "pending", "in_progress", "done", "rejected"].map((status) => (
          <a
            key={status}
            href={status === "all" ? "/queue" : `/queue?status=${status}`}
            aria-current={activeStatus === status ? "page" : undefined}
            className={
              "nc-button capitalize " +
              (activeStatus === status ? "border-[#d8b75d] bg-[#d8b75d]/10 text-[#d8b75d]" : "")
            }
          >
            {status.replace("_", " ")}
          </a>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/30">
        {rows.length === 0 ? (
          <div className="px-4 py-10">
            <div className="nc-empty">No feature requests match this filter.</div>
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="grid gap-4 border-b border-slate-800 px-4 py-4 last:border-b-0 md:grid-cols-[120px_90px_100px_1fr_240px]">
              <div>
                <span className={badge(row.status)}>{row.status}</span>
                <div className="mt-2 text-xs text-slate-600">{row.id.slice(0, 8)}</div>
              </div>
              <div className={`text-sm ${severityColor(row.severity)}`}>{row.severity ?? row.size ?? "-"}</div>
              <div className="text-sm text-slate-400">
                <div>{row.source}</div>
                <div className="mt-1 text-xs text-slate-500">{row.type}</div>
              </div>
              <div>
                <div className="text-sm leading-6 text-slate-200">{row.description}</div>
                {row.prUrl ? (
                  <a className="mt-1 block text-xs font-semibold text-[#d8b75d] hover:text-[#f1d58a]" href={row.prUrl}>
                    PR / deploy link
                  </a>
                ) : null}
                {row.implementationNotes ? (
                  <div className="mt-1 text-xs text-slate-500">{row.implementationNotes}</div>
                ) : null}
                {row.rejectionReason ? (
                  <div className="mt-1 text-xs text-red-400">{row.rejectionReason}</div>
                ) : null}
              </div>
              <div className="text-xs text-slate-500">
                <div>Created {new Date(row.createdAt).toLocaleString()}</div>
                {row.completedAt ? <div>Completed {new Date(row.completedAt).toLocaleString()}</div> : null}
                <form action="/api/queue/update" method="post" className="mt-3 space-y-2">
                  <input type="hidden" name="id" value={row.id} />
                  <input type="hidden" name="expectedStatus" value={row.status} />
                  <select
                    name="status"
                    defaultValue={row.status}
                    className="nc-input w-full px-2 py-1 text-xs"
                  >
                    <option value="pending">pending</option>
                    <option value="in_progress">in_progress</option>
                    <option value="done">done</option>
                    <option value="rejected">rejected</option>
                  </select>
                  <input
                    name="note"
                    placeholder="Completion or rejection note"
                    className="nc-input w-full px-2 py-1 text-xs"
                  />
                  <button
                    type="submit"
                    className="nc-button w-full min-h-8 px-2 py-1 text-xs"
                  >
                    Update
                  </button>
                </form>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
