import { getDb, profileContext } from "@nitsyclaw/shared/db";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

type ProfileContextRow = Awaited<ReturnType<typeof load>>[number];

async function load() {
  const db = getDb();
  return db
    .select()
    .from(profileContext)
    .orderBy(desc(profileContext.updatedAt))
    .limit(100);
}

function SensitivityBadge({ value }: { value: ProfileContextRow["sensitivity"] }) {
  if (value === "sensitive") {
    return (
      <span className="inline-flex items-center rounded border border-red-500/40 bg-red-950/30 px-2 py-0.5 text-xs font-semibold text-red-300">
        sensitive
      </span>
    );
  }
  if (value === "personal") {
    return (
      <span className="inline-flex items-center rounded border border-amber-500/40 bg-amber-950/30 px-2 py-0.5 text-xs font-semibold text-amber-300">
        personal
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-400">
      normal
    </span>
  );
}

function ExpiresAt({ value }: { value: Date | null }) {
  if (!value) return null;
  const expired = value < new Date();
  return (
    <span className={expired ? "text-red-400" : "text-slate-500"}>
      {expired ? "expired " : "expires "}
      {value.toLocaleString()}
    </span>
  );
}

function ContextCard({ row }: { row: ProfileContextRow }) {
  const valueJson = JSON.stringify(row.value, null, 2);

  return (
    <div className="nc-tile flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-[#d8b75d]">{row.key}</span>
        <SensitivityBadge value={row.sensitivity} />
      </div>

      <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs leading-relaxed text-slate-300 whitespace-pre-wrap break-words">
        {valueJson}
      </pre>

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        {row.source && (
          <span>
            source: <span className="text-slate-400">{row.source}</span>
          </span>
        )}
        <span>updated {new Date(row.updatedAt).toLocaleString()}</span>
        <ExpiresAt value={row.expiresAt} />
      </div>
    </div>
  );
}

export default async function ProfilePage() {
  let rows: ProfileContextRow[] = [];
  let errorMsg: string | null = null;

  try {
    rows = await load();
  } catch {
    errorMsg = "Could not load profile context. Check Health.";
  }

  if (errorMsg) {
    return (
      <div className="nc-page">
        <section className="nc-hero">
          <div className="nc-eyebrow">Personal context</div>
          <h2 className="mt-2 text-3xl font-semibold">Profile</h2>
        </section>
        <div className="rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm">
          <p className="font-medium text-red-300">Profile context unavailable</p>
          <p className="mt-2 text-xs text-red-400">{errorMsg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Personal context</div>
        <h2 className="mt-2 text-3xl font-semibold">Profile</h2>
        <p className="mt-3 text-sm text-slate-400">
          Structured context the assistant tracks about you. Values are used to personalise responses.
        </p>
      </section>

      {rows.length === 0 ? (
        <section className="nc-section">
          <p className="nc-empty">No profile context stored yet.</p>
        </section>
      ) : (
        <section className="nc-section">
          <div className="grid gap-4 lg:grid-cols-2">
            {rows.map((row) => (
              <ContextCard key={row.id} row={row} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
