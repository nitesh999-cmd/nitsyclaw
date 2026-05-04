// Settings page — quiet hours, integrations, and owner data controls.

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ deleted?: string; deleteError?: string; scope?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-semibold">Settings</h2>

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
                ? "Export your data first, then paste the export snapshot ID from the download."
            : "Delete request was not recognised."}
        </div>
      ) : null}

      <section data-testid="settings-quiet-hours">
        <h3 className="text-sm uppercase tracking-wide text-neutral-400 mb-2">Quiet hours</h3>
        <p className="text-sm text-neutral-300">
          Configured via env: <code>{process.env.QUIET_HOURS_START ?? "22:00"}</code> →{" "}
          <code>{process.env.QUIET_HOURS_END ?? "07:00"}</code>
        </p>
      </section>

      <section data-testid="settings-integrations">
        <h3 className="text-sm uppercase tracking-wide text-neutral-400 mb-2">Integrations</h3>
        <ul className="text-sm space-y-1">
          <li>Google Calendar — {process.env.GOOGLE_CLIENT_ID ? "✅ configured" : "❌ not configured"}</li>
          <li>Anthropic Claude — {process.env.ANTHROPIC_API_KEY ? "✅ configured" : "❌ not configured"}</li>
          <li>OpenAI Whisper — {process.env.OPENAI_API_KEY ? "✅ configured" : "❌ not configured"}</li>
        </ul>
      </section>

      <section data-testid="settings-export">
        <h3 className="text-sm uppercase tracking-wide text-neutral-400 mb-2">Backups</h3>
        <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-300">
          <span>Daily DB dumps run at 03:00 in the bot worker.</span>
          <a
            href="/api/data/export"
            className="border border-neutral-700 px-3 py-2 text-xs text-neutral-100 hover:border-neutral-500"
          >
            Export my data
          </a>
        </div>
      </section>

      <section data-testid="settings-data-controls">
        <h3 className="text-sm uppercase tracking-wide text-neutral-400 mb-2">Data controls</h3>
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
              detail: "Requires a fresh export snapshot and your dashboard password. External provider data is not deleted.",
              placeholder: "Type DELETE EVERYTHING",
            },
          ].map(({ scope, title, detail, placeholder }) => (
            <form key={scope} action="/api/data/delete" method="post" className="border border-neutral-800 p-4">
              <input type="hidden" name="scope" value={scope} />
              <div className="font-medium text-neutral-200">{title}</div>
              <p className="mt-2 text-xs text-neutral-500">{detail}</p>
              <label className="mt-3 block text-xs text-neutral-500" htmlFor={`confirm-${scope}`}>
                Confirmation phrase
              </label>
              <input
                id={`confirm-${scope}`}
                name="confirm"
                placeholder={placeholder}
                className="mt-1 w-full border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
              />
              {scope === "everything" ? (
                <>
                  <label className="mt-3 block text-xs text-neutral-500" htmlFor="exportSnapshotId">
                    Export snapshot ID
                  </label>
                  <input
                    id="exportSnapshotId"
                    name="exportSnapshotId"
                    placeholder="export_YYYYMMDDHHMMSS"
                    className="mt-1 w-full border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
                  />
                  <label className="mt-3 block text-xs text-neutral-500" htmlFor="currentPassword">
                    Current dashboard password
                  </label>
                  <input
                    id="currentPassword"
                    name="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    className="mt-1 w-full border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
                  />
                </>
              ) : null}
              <button className="mt-3 border border-red-900 px-3 py-2 text-xs text-red-200 hover:border-red-600">
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
