import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, insertReminder, reminders } from "@nitsyclaw/shared/db";
import { privateOwnerTenant } from "@nitsyclaw/shared/tenancy";
import { parseRelativeTime } from "@nitsyclaw/shared/utils";
import { desc, eq } from "drizzle-orm";
import { getOwnerIdentity, logDashboardLoadError, publicConfigErrorOrNull } from "../../lib/dashboard-runtime";

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
  const fireAt = parsed?.fireAt ?? (directDate && !Number.isNaN(directDate.getTime()) ? directDate : null);
  if (!fireAt) {
    redirect("/reminders?error=invalid-date");
  }

  const { ownerHash } = getOwnerIdentity();
  await insertReminder(getDb(), privateOwnerTenant(ownerHash), {
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
  if (!id || !value || Number.isNaN(fireAt.getTime())) {
    redirect("/reminders?error=reschedule-invalid-date");
  }

  await getDb()
    .update(reminders)
    .set({ fireAt, status: "pending" })
    .where(eq(reminders.id, id));
  revalidatePath("/reminders");
  revalidatePath("/");
}

export default async function RemindersPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const createError = params?.error === "invalid-date"
    ? "Date not recognised. Try: tomorrow 9am, Friday 3pm, or 2026-05-10T09:00."
    : params?.error === "reschedule-invalid-date"
    ? "Pick a date and time before clicking Reschedule."
    : null;

  let rows: Awaited<ReturnType<typeof load>> = [];
  try {
    rows = await load();
  } catch (e: unknown) {
    logDashboardLoadError("reminders", e);
    const message = publicConfigErrorOrNull(e)?.reply ?? "Reminders are unavailable. Try again shortly.";
    return (
      <div className="nc-page">
        <section className="nc-hero">
          <div className="nc-eyebrow">Scheduled alerts</div>
          <h2 className="mt-2 text-3xl font-semibold">Reminders</h2>
        </section>
        <div className="border border-red-900 bg-red-950/40 p-4 text-sm">
          <p className="font-medium text-red-300">Database error</p>
          <p className="text-xs text-red-400 mt-2">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Scheduled alerts</div>
        <h2 className="mt-2 text-3xl font-semibold">Reminders</h2>
        <p className="mt-3 text-sm text-slate-400">
          Create, complete, cancel, or reschedule reminders without going through chat.
        </p>
      </section>

      {createError ? (
        <div className="rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-200" role="alert">
          {createError}
        </div>
      ) : null}

      <section className="nc-section">
        <h3 className="nc-eyebrow mb-3">New reminder</h3>
        <form action={createReminder} className="grid gap-3 border border-slate-800 p-4 md:grid-cols-[1fr_220px_auto]">
          <label className="text-sm">
            <span className="mb-1 block text-slate-400">Reminder</span>
            <input
              name="text"
              required
              placeholder="Call Sam"
              className="nc-input w-full"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-400">When</span>
            <input
              name="when"
              required
              placeholder="tomorrow 9am"
              className="nc-input w-full"
            />
          </label>
          <button className="nc-button self-end">Add</button>
        </form>
      </section>

      {rows.length === 0 ? (
        <section className="nc-section">
          <p className="nc-muted">No reminders yet. Add one above or ask in chat: remind me tomorrow at 9am.</p>
        </section>
      ) : (
        <section className="nc-section">
          <table className="w-full text-sm" data-testid="reminders-table">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-800">
                <th className="py-2 pr-4">When</th>
                <th className="pr-4">Status</th>
                <th className="pr-4">Recurring</th>
                <th className="pr-4">Text</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-800 align-top">
                  <td className="py-2 pr-4 whitespace-nowrap">{new Date(r.fireAt).toLocaleString()}</td>
                  <td className="py-2 pr-4">
                    <span className={
                      r.status === "pending" ? "text-amber-400" :
                      r.status === "fired" ? "text-emerald-400" :
                      "text-slate-500"
                    }>
                      {r.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-xs text-slate-500">{r.rrule ?? "-"}</td>
                  <td className="py-2 pr-4 text-slate-200">{r.text}</td>
                  <td className="space-y-2 py-2">
                    <div className="flex flex-wrap gap-2">
                      {r.status !== "fired" ? (
                        <form action={setReminderStatus}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="status" value="fired" />
                          <button className="nc-button text-xs px-2 py-1 text-emerald-300 border-emerald-800/40">
                            Complete
                          </button>
                        </form>
                      ) : null}
                      {r.status !== "cancelled" ? (
                        <form action={setReminderStatus}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="status" value="cancelled" />
                          <button className="nc-button text-xs px-2 py-1 text-slate-400">
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
                        required
                        className="nc-input w-44 text-xs px-2 py-1"
                      />
                      <button className="nc-button text-xs px-2 py-1">Reschedule</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

async function load() {
  const db = getDb();
  return db.select().from(reminders).orderBy(desc(reminders.fireAt)).limit(100);
}
