import { getDb, confirmations } from "@nitsyclaw/shared/db";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

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
          : "border-neutral-700 text-neutral-300";
  return `rounded border px-2 py-1 text-xs ${cls}`;
}

function summarize(payload: Record<string, unknown>) {
  const copy = { ...payload };
  if (Array.isArray(copy.uris)) copy.uris = `${copy.uris.length} Spotify tracks`;
  if (copy.ownerHash) copy.ownerHash = "owner";
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Confirmations</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Important actions wait here. Reply yes/no in WhatsApp or chat to resolve the latest pending action.
        </p>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <div className="divide-y divide-neutral-800 border-y border-neutral-800">
        {rows.map((row) => (
          <div key={row.id} className="grid gap-3 py-4 md:grid-cols-[120px_180px_1fr_160px]">
            <div><span className={badge(row.status)}>{row.status}</span></div>
            <div className="text-sm">{row.action}</div>
            <div className="text-xs text-neutral-400">{summarize(row.payload as Record<string, unknown>)}</div>
            <div className="text-xs text-neutral-500">
              <div>{new Date(row.createdAt).toLocaleString()}</div>
              <div>Expires {new Date(row.expiresAt).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
