import { getDb, reminders } from "@nitsyclaw/shared/db";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  let rows: Awaited<ReturnType<typeof load>> = [];
  try {
    rows = await load();
  } catch (e: any) {
    console.error("[Reminders] DB error:", e);
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Reminders</h1>
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-sm font-medium text-red-900">Database error</p>
          <pre className="text-xs text-red-700 mt-2 whitespace-pre-wrap">{e?.message ?? String(e)}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Reminders</h1>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No reminders yet.</p>
      ) : (
        <table className="w-full text-sm" data-testid="reminders-table">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-1">When</th>
              <th>Status</th>
              <th>Recurring</th>
              <th>Text</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-neutral-800">
                <td className="py-1">{new Date(r.fireAt).toLocaleString()}</td>
                <td>{r.status}</td>
                <td>{r.rrule ?? "—"}</td>
                <td>{r.text}</td>
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
  return db.select().from(reminders).orderBy(desc(reminders.fireAt)).limit(100);
}