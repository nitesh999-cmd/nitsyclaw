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
        <div className="text-sm text-slate-300">
          <div className="font-medium text-slate-100">
            {saleReadiness.ready ? "Ready for public sale" : "Not ready for public sale"}
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Mode: {saleReadiness.mode}. This must stay blocked until multi-user auth, tenant isolation,
            provider delete/revoke, and legal/privacy copy are verified.
          </p>
          <a href="/api/sale-readiness" className="mt-3 inline-flex text-xs font-medium text-cyan-200">
            View readiness JSON
          </a>
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

      <section className="nc-section" data-testid="settings-data-controls">
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
