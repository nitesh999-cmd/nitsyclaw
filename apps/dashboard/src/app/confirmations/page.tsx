import { revalidatePath } from "next/cache";
import { getDb, confirmations, setConfirmationStatus } from "@nitsyclaw/shared/db";
import { createPrivateSpotifyPlaylist } from "@nitsyclaw/shared/integrations/spotify";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function rejectConfirmation(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await setConfirmationStatus(getDb(), id, "rejected");
  revalidatePath("/confirmations");
  revalidatePath("/");
}

async function approveSpotifyConfirmation(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const db = getDb();
  const [row] = await db.select().from(confirmations).where(eq(confirmations.id, id)).limit(1);
  if (!row || row.status !== "pending") return;
  if (row.expiresAt < new Date()) {
    await setConfirmationStatus(db, id, "expired");
    revalidatePath("/confirmations");
    revalidatePath("/");
    return;
  }
  if (row.action !== "spotify_create_playlist") return;

  const payload = row.payload as {
    name: string;
    description?: string;
    uris: string[];
    ownerHash?: string;
  };
  await setConfirmationStatus(db, id, "approved");
  await createPrivateSpotifyPlaylist(db, payload.ownerHash ?? "", {
    name: payload.name,
    description: payload.description,
    uris: payload.uris,
  });
  revalidatePath("/confirmations");
  revalidatePath("/");
}

async function loadConfirmations() {
  const db = getDb();
  return db.select().from(confirmations).orderBy(desc(confirmations.createdAt)).limit(100);
}

function badge(status: string) {
  const cls =
    status === "pending"
      ? "border-amber-500/40 text-amber-300"
      : status === "approved"
        ? "border-emerald-500/40 text-emerald-300"
        : status === "rejected"
          ? "border-red-500/40 text-red-300"
          : "border-slate-700 text-slate-400";
  return `rounded border px-2 py-1 text-xs ${cls}`;
}

function summarize(payload: Record<string, unknown>) {
  const copy = { ...payload };
  if (copy.createdFrom === "queue_email_draft_creation") {
    return JSON.stringify({
      provider: copy.provider,
      to: Array.isArray(copy.to) ? `${copy.to.length} recipient(s)` : undefined,
      cc: Array.isArray(copy.cc) ? `${copy.cc.length} cc recipient(s)` : undefined,
      bcc: Array.isArray(copy.bcc) ? `${copy.bcc.length} bcc recipient(s)` : undefined,
      subject: "[redacted]",
    }).slice(0, 240);
  }
  if (Array.isArray(copy.uris)) copy.uris = `${copy.uris.length} Spotify tracks`;
  if (copy.ownerHash) copy.ownerHash = "owner";
  for (const key of ["body", "message", "content"]) {
    if (key in copy) copy[key] = "[redacted]";
  }
  if (Array.isArray(copy.to)) copy.to = `${copy.to.length} recipient(s)`;
  if (Array.isArray(copy.cc)) copy.cc = `${copy.cc.length} cc recipient(s)`;
  if (Array.isArray(copy.bcc)) copy.bcc = `${copy.bcc.length} bcc recipient(s)`;
  return JSON.stringify(copy).slice(0, 240);
}

export default async function ConfirmationsPage() {
  let rows: Awaited<ReturnType<typeof loadConfirmations>> = [];
  let error: string | null = null;
  try {
    rows = await loadConfirmations();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const pending = rows.filter((r) => r.status === "pending");

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Safety gate</div>
        <h2 className="mt-2 text-3xl font-semibold">Confirmations</h2>
        <p className="mt-3 text-sm text-slate-400">
          Important actions wait here. Reply yes/no in WhatsApp or chat to resolve the latest pending action.
          {pending.length > 0 && (
            <span className="ml-2 rounded border border-amber-500/40 px-2 py-0.5 text-xs text-amber-300">
              {pending.length} pending
            </span>
          )}
        </p>
      </section>

      {error ? (
        <div className="border border-red-900 bg-red-950/30 p-3 text-sm text-red-200" role="alert">{error}</div>
      ) : null}

      {rows.length === 0 ? (
        <section className="nc-section">
          <p className="nc-muted">No confirmations yet. Important actions will appear here.</p>
        </section>
      ) : (
        <section className="nc-section">
          <div className="divide-y divide-slate-800 border-y border-slate-800">
            {rows.map((row) => (
              <div key={row.id} className="grid gap-3 py-4 md:grid-cols-[120px_180px_1fr_180px_160px] md:items-start">
                <div><span className={badge(row.status)}>{row.status}</span></div>
                <div className="text-sm text-slate-200">{row.action}</div>
                <div className="text-xs text-slate-500 break-all">{summarize(row.payload as Record<string, unknown>)}</div>
                <div className="text-xs text-slate-500">
                  <div>{new Date(row.createdAt).toLocaleString()}</div>
                  <div className={row.expiresAt < new Date() ? "text-red-400" : ""}>
                    Expires {new Date(row.expiresAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {row.status === "pending" && row.action === "spotify_create_playlist" ? (
                    <form action={approveSpotifyConfirmation}>
                      <input type="hidden" name="id" value={row.id} />
                      <button className="rounded border border-emerald-800/60 px-3 py-1 text-xs text-emerald-300 hover:border-emerald-500 hover:bg-emerald-950/30">
                        Approve
                      </button>
                    </form>
                  ) : null}
                  {row.status === "pending" ? (
                    <form action={rejectConfirmation}>
                      <input type="hidden" name="id" value={row.id} />
                      <button className="rounded border border-red-900/60 px-3 py-1 text-xs text-red-300 hover:border-red-600 hover:bg-red-950/30">
                        Reject
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
