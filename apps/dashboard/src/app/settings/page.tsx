// Settings page — quiet hours, integrations, and owner data controls.

import { evaluateSaleReadiness } from "../../lib/sale-readiness";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ deleted?: string; deleteError?: string; scope?: string }>;
}) {
  const params = await searchParams;
  const saleReadiness = evaluateSaleReadiness();
  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Owner controls</div>
        <h2 className="mt-2 text-3xl font-semibold">Settings</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          Privacy, backups, quiet hours, and the controls that make this safe enough for daily use.
        </p>
      </section>

      {params?.deleted ? (
        <div className="border border-emerald-900 bg-emerald-950/30 p-3 text-sm text-emerald-200" role="status">
          Data deletion completed for {plainScope(params.deleted)}.
        </div>
      ) : null}
      {params?.deleteError ? (
        <div className="border border-red-900 bg-red-950/30 p-3 text-sm text-red-200" role="alert">
          {params.deleteError === "confirm"
            ? `Type the exact confirmation phrase for ${plainScope(params.scope ?? "")}.`
            : params.deleteError === "reauth"
              ? "Enter your current dashboard password before deleting everything."
            : params.deleteError === "export"
                ? "Export your data first, then paste the snapshot ID and export proof from the download."
                : params.deleteError === "provider-revoke"
                  ? "A connected provider could not be disconnected. Retry before deleting everything."
            : "Delete request was not recognised."}
        </div>
      ) : null}

      <section className="nc-section" data-testid="settings-quiet-hours">
        <h3 className="nc-eyebrow mb-2">Quiet hours</h3>
        <p className="text-sm text-slate-300">
          Configured via env: <code>{process.env.QUIET_HOURS_START ?? "22:00"}</code> to{" "}
          <code>{process.env.QUIET_HOURS_END ?? "07:00"}</code>
        </p>
      </section>

      <section className="nc-section" data-testid="settings-integrations">
        <h3 className="nc-eyebrow mb-3">Integrations</h3>
        <ul className="grid gap-2 text-sm md:grid-cols-3">
          <li className="nc-tile">Google Calendar: {process.env.GOOGLE_CLIENT_ID ? "configured" : "not configured"}</li>
          <li className="nc-tile">Anthropic Claude: {process.env.ANTHROPIC_API_KEY ? "configured" : "not configured"}</li>
          <li className="nc-tile">OpenAI Whisper: {process.env.OPENAI_API_KEY ? "configured" : "not configured"}</li>
        </ul>
      </section>

      <section className="nc-section" data-testid="settings-sale-readiness">
        <h3 className="nc-eyebrow mb-2">Launch readiness</h3>
        <div className="grid gap-3 text-sm md:grid-cols-[180px_180px_1fr]">
          <ScoreTile label="Ready for me" score={saleReadiness.privateUseScore} />
          <ScoreTile label="Ready for customers" score={saleReadiness.publicSaleScore} />
          <div>
            <div className="font-medium text-slate-100">
              {saleReadiness.ready ? "Ready to sell" : "Not ready to sell yet"}
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Personal use checks the basics needed for your own daily system. Customer use stays capped until
              customer accounts, separate customer data, disconnect/delete controls, and reviewed legal pages are real.
            </p>
            <ul className="mt-3 space-y-1 text-xs leading-5 text-slate-400">
              {[...saleReadiness.privateUseBlockers, ...saleReadiness.blockers].slice(0, 5).map((blocker) => (
                <li key={blocker}>- {plainReadinessItem(blocker)}</li>
              ))}
            </ul>
            <details className="mt-3 text-xs text-slate-500">
              <summary className="cursor-pointer font-medium text-[#d8b75d]">Advanced status</summary>
              <a href="/api/sale-readiness" className="mt-2 inline-flex font-medium text-[#d8b75d]">
                View technical readiness JSON
              </a>
            </details>
          </div>
        </div>
      </section>

      <section className="nc-section" data-testid="settings-export">
        <h3 className="nc-eyebrow mb-2">Backups</h3>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
          <span>Daily DB dumps run at 03:00 in the bot worker.</span>
          <a
            href="/api/data/export"
            className="nc-button-primary"
          >
            Export my data
          </a>
        </div>
      </section>

      <section id="data-controls" className="nc-section" data-testid="settings-data-controls">
        <h3 className="nc-eyebrow mb-3">Data controls</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            {
              scope: "memories",
              title: "Delete memories",
              detail: "Removes saved memory notes. Conversation logs stay.",
              placeholder: "Type DELETE MEMORIES",
            },
            {
              scope: "conversations",
              title: "Delete conversations",
              detail: "Removes message rows. Saved memories stay.",
              placeholder: "Type DELETE CONVERSATIONS",
            },
            {
              scope: "everything",
              title: "Delete everything",
              detail: "Requires a fresh export snapshot and your dashboard password. Connected providers are disconnected first; if local deletion then fails, reconnect that provider after retrying cleanup.",
              placeholder: "Type DELETE EVERYTHING",
            },
          ].map(({ scope, title, detail, placeholder }) => (
            <form key={scope} action="/api/data/delete" method="post" className="nc-tile">
              <input type="hidden" name="scope" value={scope} />
              <div className="font-medium text-slate-100">{title}</div>
              <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
              <label className="mt-3 block text-xs text-slate-500" htmlFor={`confirm-${scope}`}>
                Confirmation phrase
              </label>
              <input
                id={`confirm-${scope}`}
                name="confirm"
                placeholder={placeholder}
                className="nc-input mt-1 w-full"
              />
              {scope === "everything" ? (
                <>
                  <label className="mt-3 block text-xs text-slate-500" htmlFor="exportSnapshotId">
                    Export snapshot ID
                  </label>
                  <input
                    id="exportSnapshotId"
                    name="exportSnapshotId"
                    placeholder="export_YYYYMMDDHHMMSS"
                    className="nc-input mt-1 w-full"
                  />
                  <label className="mt-3 block text-xs text-slate-500" htmlFor="exportProof">
                    Export proof
                  </label>
                  <textarea
                    id="exportProof"
                    name="exportProof"
                    rows={3}
                    className="nc-input mt-1 w-full"
                  />
                  <label className="mt-3 block text-xs text-slate-500" htmlFor="currentPassword">
                    Current dashboard password
                  </label>
                  <input
                    id="currentPassword"
                    name="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    className="nc-input mt-1 w-full"
                  />
                </>
              ) : null}
              <button className="mt-3 inline-flex min-h-10 items-center border border-red-900 px-3 py-2 text-xs font-medium text-red-200 transition-colors hover:border-red-600 hover:bg-red-950/30">
                Delete
              </button>
            </form>
          ))}
        </div>
      </section>
    </div>
  );
}

function plainScope(scope: string): string {
  if (scope === "memories") return "memories";
  if (scope === "conversations") return "conversations";
  if (scope === "everything") return "everything";
  return "selected data";
}

function plainReadinessItem(item: string): string {
  const map: Record<string, string> = {
    "owner dashboard password is missing or too weak": "Set a strong owner password",
    "database URL is missing or invalid": "Connect the database properly",
    "AI provider key is not configured": "Connect at least one AI provider",
    "storage encryption key is missing or invalid": "Set a valid storage encryption key",
    "owner WhatsApp number is missing or invalid": "Set your WhatsApp number in international format",
    "multi-user auth is not verified": "Add customer accounts",
    "tenant isolation is not verified": "Keep each customer's data separate",
    "provider-side delete/revoke is not verified": "Let customers disconnect and delete connected services",
    "legal/privacy copy is not verified": "Finish reviewed privacy, terms, and support pages",
  };
  if (item.startsWith("tenant-scoped storage is missing")) {
    return item.replace("tenant-scoped storage is missing for", "Add customer separation to");
  }
  if (item.startsWith("tenant review is still needed")) {
    return item.replace("tenant review is still needed for", "Review customer separation for");
  }
  return map[item] ?? item;
}

function ScoreTile({ label, score }: { label: string; score: number }) {
  const tone = score >= 9 ? "text-emerald-400" : score >= 6 ? "text-amber-400" : "text-red-400";
  return (
    <div className="nc-tile p-4">
      <div className="nc-eyebrow">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${tone}`}>{score}/10</div>
    </div>
  );
}
