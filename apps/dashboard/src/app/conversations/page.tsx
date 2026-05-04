import { getDb, messages } from "@nitsyclaw/shared/db";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

interface MessageMetadata {
  masked?: string;
}

export default async function ConversationsPage() {
  let rows: Awaited<ReturnType<typeof load>> = [];
  let errorMsg: string | null = null;
  try {
    rows = await load();
  } catch (e: unknown) {
    console.error("[conversations] load failed", e);
    errorMsg = "Could not load conversations. Check Health.";
  }

  if (errorMsg) {
    return (
      <div className="nc-page">
        <section className="nc-hero">
          <div className="nc-eyebrow">Message ledger</div>
          <h2 className="mt-2 text-3xl font-semibold">Conversations</h2>
        </section>
        <div className="border border-red-900 bg-red-950/40 p-4 text-sm">
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
      {rows.length === 0 ? (
        <section className="nc-section">
          <p className="nc-muted">No messages yet.</p>
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

async function load() {
  const db = getDb();
  return db.select().from(messages).orderBy(desc(messages.createdAt)).limit(100);
}
