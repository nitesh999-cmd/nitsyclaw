import { getDb, messages } from "@nitsyclaw/shared/db";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ConversationsPage() {
  let rows: Awaited<ReturnType<typeof load>> = [];
  try {
    rows = await load();
  } catch {
    return <p className="text-sm text-neutral-500">DB not configured.</p>;
  }
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Conversations</h2>
      <p className="text-xs text-neutral-500 mb-6">
        Body fields are encrypted at rest (R6). The decryption key lives in <code>ENCRYPTION_KEY</code>.
      </p>
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
              <td>{(m.metadata as { masked?: string })?.masked ?? "—"}</td>
              <td>{m.intent ?? ""}</td>
              <td className="truncate max-w-md">{m.body.slice(0, 80)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function load() {
  const db = getDb();
  return db.select().from(messages).orderBy(desc(messages.createdAt)).limit(100);
}
