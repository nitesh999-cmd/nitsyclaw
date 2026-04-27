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
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  if (errorMsg) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Conversations</h2>
        <div className="p-4 bg-red-950/40 border border-red-900 rounded text-sm">
          <p className="font-medium text-red-300">Database error</p>
          <pre className="text-xs text-red-400 mt-2 whitespace-pre-wrap">{errorMsg}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Conversations</h2>
      <p className="text-xs text-neutral-500">
        Last {rows.length} messages. Body content is encrypted at rest and not displayed here.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No messages yet.</p>
      ) : (
        <table className="w-full text-sm" data-testid="conversations-table">
          <thead>
            <tr className="text-left text-neutral-400 border-b border-neutral-800">
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
                <tr key={m.id} className="border-b border-neutral-900">
                  <td className="py-2 pr-4 whitespace-nowrap">{new Date(m.createdAt).toLocaleString()}</td>
                  <td className="pr-4">
                    <span className={m.direction === "in" ? "text-blue-400" : "text-green-400"}>
                      {m.direction}
                    </span>
                  </td>
                  <td className="pr-4 text-xs text-neutral-300">{fromMasked}</td>
                  <td className="pr-4 text-xs">{m.intent ?? "—"}</td>
                  <td className="text-xs text-neutral-400">{m.mediaType ?? "—"}</td>
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
