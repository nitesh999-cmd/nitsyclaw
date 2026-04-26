import { getDb, reminders } from "@nitsyclaw/shared/db";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  let rows: Awaited<ReturnType<typeof load>> = [];
  try { rows = await load(); } catch { return <p className="text-sm text-neutral-500">DB not configured.</p>; }
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Reminders</h2>
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
    </div>
  );
}

async function load() {
  const db = getDb();
  return db.select().from(reminders).orderBy(desc(reminders.fireAt)).limit(100);
}
