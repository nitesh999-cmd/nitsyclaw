import { getDb, messages } from "@nitsyclaw/shared/db";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ConversationsPage() {
  let rows: Awaited<ReturnType<typeof load>> = [];
  try {
    rows = await load();
  } catch (e: any) {
    console.error("[Conversations] DB error:", e);
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Conversations</h1>
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-sm font-medium text-red-900">Database error</p>
          <pre className="text-xs text-red-700 mt-2 whitespace-pre-wrap">{e?.message ?? String(e)}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Conversations</h1>
      <p className="text-xs text-neutral-500 mb-4">
        Body fields are encrypted at rest. Last 100 messages with intent detection.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No messages yet.</p>
      ) : (
        <table className="w-full text-sm" data-testid="conversations-table">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-1">Time</th>
              <th>Dir</th>
              <th>From</th>
              <th>Intent</th>
              <th>Body</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-t border-neutral-800">
                <td className="py-1">{new Date(m.createdAt).toLocaleString()}</td>
                <td>{m.direction}</td>
                <td className="text-xs">{(m.metadata as { masked?: string })?.masked ?? "—"}</td>
                <td>{m.intent ?? "—"}</td>
                <td className="truncate max-w-md">{m.body.slice(0, 80)}</td>
              </tr>
            ))}
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