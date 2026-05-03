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

function badge(status: string) {
  const cls =
    status === "done"
      ? "border-emerald-500/40 text-emerald-300"
      : status === "in_progress"
        ? "border-sky-500/40 text-sky-300"
        : status === "rejected"
          ? "border-red-500/40 text-red-300"
          : "border-neutral-700 text-neutral-300";
  return `rounded border px-2 py-1 text-xs ${cls}`;
}

export default async function QueuePage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  let rows: Awaited<ReturnType<typeof loadQueue>> = [];
  let error: string | null = null;
  const params = searchParams ? await searchParams : undefined;
  try {
    rows = await loadQueue(params?.status);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Feature Queue</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Requests captured from WhatsApp and dashboard. Use `/addfeature your idea` to add one.
        </p>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <div className="flex flex-wrap gap-2 text-sm">
        {["all", "pending", "in_progress", "done", "rejected"].map((status) => (
          <a
            key={status}
            href={status === "all" ? "/queue" : `/queue?status=${status}`}
            className="border border-neutral-800 px-3 py-2 text-neutral-300 hover:border-neutral-700"
          >
            {status}
          </a>
        ))}
      </div>

      <div className="divide-y divide-neutral-800 border-y border-neutral-800">
        {rows.map((row) => (
          <div key={row.id} className="grid gap-3 py-4 md:grid-cols-[110px_80px_90px_1fr_220px]">
            <div>
              <span className={badge(row.status)}>{row.status}</span>
              <div className="mt-2 text-xs text-neutral-500">{row.id.slice(0, 8)}</div>
            </div>
            <div className="text-sm text-neutral-400">{row.size}</div>
            <div className="text-sm text-neutral-400">
              <div>{row.source}</div>
              <div className="mt-1 text-xs">{row.type}</div>
            </div>
            <div>
              <div className="text-sm">{row.description}</div>
              {row.prUrl ? <a className="mt-1 block text-xs text-sky-300" href={row.prUrl}>PR / deploy link</a> : null}
              {row.implementationNotes ? (
                <div className="mt-1 text-xs text-neutral-500">{row.implementationNotes}</div>
              ) : null}
              {row.rejectionReason ? (
                <div className="mt-1 text-xs text-red-300">{row.rejectionReason}</div>
              ) : null}
            </div>
            <div className="text-xs text-neutral-500">
              <div>Created {new Date(row.createdAt).toLocaleString()}</div>
              {row.completedAt ? <div>Completed {new Date(row.completedAt).toLocaleString()}</div> : null}
              <form action="/api/queue/update" method="post" className="mt-3 space-y-2">
                <input type="hidden" name="id" value={row.id} />
                <select
                  name="status"
                  defaultValue={row.status}
                  className="w-full border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-200"
                >
                  <option value="pending">pending</option>
                  <option value="in_progress">in_progress</option>
                  <option value="done">done</option>
                  <option value="rejected">rejected</option>
                </select>
                <input
                  name="note"
                  placeholder="Completion or rejection note"
                  className="w-full border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 placeholder:text-neutral-600"
                />
                <button
                  type="submit"
                  className="w-full border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:border-neutral-500"
                >
                  Update
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
