import { loadReleaseWarRoomSummary } from "../../lib/release-war-room";

export const dynamic = "force-dynamic";

export default async function ReleasePage() {
  const summary = await loadReleaseWarRoomSummary();
  const tone =
    summary.status === "ready"
      ? "text-emerald-300"
      : summary.status === "watch"
        ? "text-amber-300"
        : "text-red-300";

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Release war room</div>
        <h2 className="mt-2 text-3xl font-semibold">Ship with proof, not guesswork</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          Latest commit, deployment identity, WhatsApp readiness, unresolved P0/P1 risks, proof prompts, and rollback notes in one place.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href="/health" className="nc-button-primary">Open health</a>
          <a href="/whatsapp-recovery" className="nc-button">WhatsApp recovery</a>
        </div>
      </section>

      <section className="nc-section" data-testid="release-war-room-status">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="nc-eyebrow">Current release status</div>
            <h3 className={`mt-2 text-2xl font-semibold ${tone}`}>{plainStatus(summary.status)}</h3>
            <p className="mt-2 text-sm text-slate-400">Generated {new Date(summary.generatedAt).toLocaleString()}.</p>
          </div>
          <a href="/api/healthz" className="nc-button">Check API health</a>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <Metric label="Dashboard commit" value={summary.dashboardCommit} />
          <Metric label="Bot commit" value={summary.botCommit} />
          <Metric label="WhatsApp client" value={summary.whatsappFreshness} tone={summary.whatsappFreshness === "ok" ? "good" : "bad"} />
          <Metric label="Loop guard" value={summary.loopGuardStatus} tone={summary.loopGuardStatus === "ok" ? "good" : summary.loopGuardStatus === "paused" ? "bad" : "watch"} />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="nc-tile">
          <div className="nc-eyebrow">Open P0/P1 risk</div>
          <div className={summary.queue.p0p1Open ? "mt-2 text-3xl font-semibold text-red-300" : "mt-2 text-3xl font-semibold text-emerald-300"}>
            {summary.queue.p0p1Open}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Queue: {summary.queue.pending} pending, {summary.queue.inProgress} in progress. Oldest open: {summary.queue.oldestOpenHours}h.
          </p>
        </div>
        <div className="nc-tile">
          <div className="nc-eyebrow">Command jobs</div>
          <div className={summary.commandJobs.failed ? "mt-2 text-3xl font-semibold text-red-300" : "mt-2 text-3xl font-semibold text-slate-100"}>
            {summary.commandJobs.failed} failed
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {summary.commandJobs.retrying} retrying, {summary.commandJobs.working} working.
          </p>
        </div>
        <div className="nc-tile">
          <div className="nc-eyebrow">Sellability</div>
          <div className={summary.sale.canSellPublicly ? "mt-2 text-3xl font-semibold text-emerald-300" : "mt-2 text-3xl font-semibold text-amber-300"}>
            {summary.sale.publicSaleScore}/10
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Personal use: {summary.sale.privateUseScore}/10. Public sale stays blocked until customer data boundaries are real.
          </p>
        </div>
      </section>

      <section className="nc-section" data-testid="release-proof-report">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="nc-eyebrow">Post-deploy proof</div>
            <h3 className="mt-2 text-xl font-semibold text-slate-100">Server gates plus phone proof</h3>
          </div>
          <code className="rounded-md border border-slate-800 bg-black/30 px-3 py-2 text-xs text-emerald-200">
            pnpm run release:post-deploy-proof
          </code>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-sm font-medium text-slate-200">Server-side gates</div>
            <ul className="mt-3 space-y-2 text-sm text-slate-400">
              {summary.proof.serverSideGates.map((gate) => (
                <li key={gate}>- {gate}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-sm font-medium text-slate-200">Phone proof prompts</div>
            <ul className="mt-3 space-y-2 text-sm text-slate-400">
              {summary.proof.phonePrompts.map((prompt) => (
                <li key={prompt}>- {prompt}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="nc-section">
          <div className="nc-eyebrow">Top blockers</div>
          <ul className="mt-4 space-y-2 text-sm text-slate-400">
            {summary.sale.blockers.slice(0, 8).map((blocker) => (
              <li key={blocker}>- {plainBlocker(blocker)}</li>
            ))}
          </ul>
        </div>
        <div className="nc-section">
          <div className="nc-eyebrow">Rollback notes</div>
          <ul className="mt-4 space-y-2 text-sm text-slate-400">
            {summary.rollbackNotes.map((note) => (
              <li key={note}>- {note}</li>
            ))}
          </ul>
          <a href="/whatsapp-recovery" className="nc-button mt-5">Open recovery board</a>
        </div>
      </section>

      <section className="nc-section">
        <div className="nc-eyebrow">Latest audit signal</div>
        <p className="mt-2 text-sm text-slate-400">{summary.latestAudit ?? "No tool audit signal found."}</p>
        {summary.dashboardDeploymentId ? (
          <p className="mt-2 text-xs text-slate-500">Dashboard deployment: {summary.dashboardDeploymentId}</p>
        ) : null}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "good" | "watch" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "good" ? "text-emerald-300" : tone === "watch" ? "text-amber-300" : tone === "bad" ? "text-red-300" : "text-slate-100";
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
      <div className="nc-eyebrow">{label}</div>
      <div className={`mt-2 truncate text-lg font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function plainStatus(status: "ready" | "watch" | "blocked") {
  if (status === "ready") return "Ready";
  if (status === "watch") return "Watch";
  return "Blocked";
}

function plainBlocker(blocker: string) {
  return blocker
    .replace("tenant-scoped storage is missing for", "Customer data separation missing for")
    .replace("tenant review is still needed for", "Customer data review needed for")
    .replace("multi-user auth is not verified", "Customer accounts are not verified")
    .replace("tenant isolation is not verified", "Customer data isolation is not verified");
}
