import { revalidatePath } from "next/cache";
import { getDb, insertReminder, reminders } from "@nitsyclaw/shared/db";
import { parseRelativeTime } from "@nitsyclaw/shared/utils";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function createReminder(formData: FormData) {
  "use server";
  const text = String(formData.get("text") ?? "").trim();
  const when = String(formData.get("when") ?? "").trim();
  if (!text || !when) return;

  const now = new Date();
  const timezone = process.env.TIMEZONE ?? "Australia/Melbourne";
  const parsed = parseRelativeTime(when, now, timezone);
  const directDate = parsed ? null : new Date(when);
  const fireAt = parsed?.fireAt ?? (!Number.isNaN(directDate.getTime()) ? directDate : null);
  if (!fireAt) return;

  await insertReminder(getDb(), {
    text,
    fireAt,
    rrule: null,
  });
  revalidatePath("/reminders");
  revalidatePath("/");
}

async function setReminderStatus(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["pending", "fired", "cancelled"].includes(status)) return;

  await getDb()
    .update(reminders)
    .set({ status: status as "pending" | "fired" | "cancelled" })
    .where(eq(reminders.id, id));
  revalidatePath("/reminders");
  revalidatePath("/");
}

async function rescheduleReminder(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const value = String(formData.get("fireAt") ?? "");
  const fireAt = new Date(value);
  if (!id || Number.isNaN(fireAt.getTime())) return;

  await getDb()
    .update(reminders)
    .set({ fireAt, status: "pending" })
    .where(eq(reminders.id, id));
  revalidatePath("/reminders");
  revalidatePath("/");
}

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
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reminders</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Create, complete, cancel, or reschedule reminders without going through chat.
        </p>
      </div>

      <form action={createReminder} className="grid gap-3 border border-neutral-800 p-4 md:grid-cols-[1fr_220px_auto]">
        <label className="text-sm">
          <span className="mb-1 block text-neutral-400">Reminder</span>
          <input
            name="text"
            required
            placeholder="Call Sam"
            className="w-full border border-neutral-800 bg-transparent px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-neutral-400">When</span>
          <input
            name="when"
            required
            placeholder="tomorrow 9am"
            className="w-full border border-neutral-800 bg-transparent px-3 py-2"
          />
        </label>
        <button className="self-end border border-neutral-700 px-4 py-2 text-sm hover:border-neutral-500">
          Add
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No reminders yet. Add one above or ask in chat: remind me tomorrow at 9am.</p>
      ) : (
        <table className="w-full text-sm" data-testid="reminders-table">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-1">When</th>
              <th>Status</th>
              <th>Recurring</th>
              <th>Text</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-neutral-800 align-top">
                <td className="py-2">{new Date(r.fireAt).toLocaleString()}</td>
                <td className="py-2">{r.status}</td>
                <td className="py-2">{r.rrule ?? "-"}</td>
                <td className="py-2">{r.text}</td>
                <td className="space-y-2 py-2">
                  <div className="flex flex-wrap gap-2">
                    {r.status !== "fired" ? (
                      <form action={setReminderStatus}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="status" value="fired" />
                        <button className="border border-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-600">
                          Complete
                        </button>
                      </form>
                    ) : null}
                    {r.status !== "cancelled" ? (
                      <form action={setReminderStatus}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="status" value="cancelled" />
                        <button className="border border-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-600">
                          Cancel
                        </button>
                      </form>
                    ) : null}
                  </div>
                  <form action={rescheduleReminder} className="flex flex-wrap gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input
                      type="datetime-local"
                      name="fireAt"
                      className="w-44 border border-neutral-800 bg-transparent px-2 py-1 text-xs"
                    />
                    <button className="border border-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-600">
                      Reschedule
                    </button>
                  </form>
                </td>
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
