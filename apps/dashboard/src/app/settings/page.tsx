// Settings page — quiet hours + integration stubs.
// Read-only display in v1; persistence via server actions in v1.1.

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-semibold">Settings</h2>

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
        <p className="text-sm text-neutral-300">
          Daily DB dumps run at 03:00 in the bot worker. Manual export endpoint planned for v1.1.
        </p>
      </section>

      <section data-testid="settings-data-controls">
        <h3 className="text-sm uppercase tracking-wide text-neutral-400 mb-2">Data controls</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["Export my data", "Disabled until export packaging and redaction are implemented."],
            ["Delete memories", "Disabled until scoped deletion and double confirmation are implemented."],
            ["Delete conversations", "Disabled until export-before-delete and retention policy are implemented."],
            ["Delete everything", "Disabled. This needs a separate irreversible-action safety flow."],
          ].map(([title, detail]) => (
            <div key={title} className="border border-neutral-800 p-4">
              <div className="font-medium text-neutral-200">{title}</div>
              <div className="mt-2 text-sm text-neutral-500">{detail}</div>
              <button disabled className="mt-3 border border-neutral-800 px-3 py-2 text-xs text-neutral-600">
                Coming soon
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
