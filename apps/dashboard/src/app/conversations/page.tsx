import { getDb, messages } from "@nitsyclaw/shared/db";
import { desc, eq } from "drizzle-orm";
import { logDashboardLoadError } from "../../lib/dashboard-runtime";

export const dynamic = "force-dynamic";

interface MessageMetadata {
  masked?: string;
}

type Direction = "in" | "out" | "all";

async function load(direction: Direction) {
  const db = getDb();
  const query = db.select().from(messages);
  if (direction === "in") {
    return query.where(eq(messages.direction, "in")).orderBy(desc(messages.createdAt)).limit(100);
  }
  if (direction === "out") {
    return query.where(eq(messages.direction, "out")).orderBy(desc(messages.createdAt)).limit(100);
  }
  return query.orderBy(desc(messages.createdAt)).limit(100);
}

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ dir?: string }>;
}) {
  const params = await (searchParams ?? Promise.resolve({} as { dir?: string }));
  const rawDir = params.dir ?? "all";
  const direction: Direction = rawDir === "in" ? "in" : rawDir === "out" ? "out" : "all";

  let rows: Awaited<ReturnType<typeof load>> = [];
  let errorMsg: string | null = null;
  try {
    rows = await load(direction);
  } catch (e: unknown) {
    logDashboardLoadError("conversations", e);
    errorMsg = "Could not load conversations. Try again shortly.";
  }

  if (errorMsg) {
    return (
      <div className="nc-page">
        <section className="nc-hero">
          <div className="nc-eyebrow">Message ledger</div>
          <h2 className="mt-2 text-3xl font-semibold">Conversations</h2>
        </section>
        <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm">
          <p className="font-medium text-red-300">Could not load conversations</p>
          <p className="text-xs text-red-400 mt-2">{errorMsg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Message ledger</div>
        <h2 className="mt-2 text-3xl font-semibold">Conversations</h2>
        <p className="mt-3 text-sm text-slate-400">
          Last {rows.length} messages. Body content is encrypted at rest and not displayed here.
        </p>
      </section>

      <div className="flex gap-2 text-sm">
        {(["all", "in", "out"] as Direction[]).map((d) => (
          <a
            key={d}
            href={d === "all" ? "/conversations" : `/conversations?dir=${d}`}
            aria-current={direction === d ? "page" : undefined}
            className={
              "nc-button " +
              (direction === d ? "border-[#d8b75d] bg-[#d8b75d]/10 text-[#d8b75d]" : "")
            }
          >
            {d === "all" ? "All" : d === "in" ? "Inbound" : "Outbound"}
          </a>
        ))}
      </div>

      {rows.length === 0 ? (
        <section className="nc-section">
          <p className="nc-muted">No messages{direction !== "all" ? ` (${direction})` : ""} yet.</p>
        </section>
      ) : (
        <table className="w-full border-y border-slate-800 bg-slate-950/35 text-sm" data-testid="conversations-table">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-400">
              <th className="py-2 pr-4">Time</th>
              <th className="pr-4">Direction</th>
              <th className="pr-4">From</th>
              <th className="pr-4">Intent</th>
              <th>Media</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const meta = (m.metadata ?? {}) as MessageMetadata;
              const fromMasked = meta.masked ?? m.fromNumber.replace(/(\d{4})\d+(\d{4})/, "$1****$2");
              return (
                <tr key={m.id} className="border-b border-slate-900">
                  <td className="py-2 pr-4 whitespace-nowrap">{new Date(m.createdAt).toLocaleString()}</td>
                  <td className="pr-4">
                    <span className={m.direction === "in" ? "text-blue-400" : "text-green-400"}>
                      {m.direction}
                    </span>
                  </td>
                  <td className="pr-4 text-xs text-slate-300">{fromMasked}</td>
                  <td className="pr-4 text-xs">{m.intent ?? "-"}</td>
                  <td className="text-xs text-slate-400">{m.mediaType ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
