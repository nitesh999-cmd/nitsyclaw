import { auditLog, getDb, getSystemHeartbeat } from "@nitsyclaw/shared/db";
import { classifyHeartbeat } from "@nitsyclaw/shared/ops/heartbeat";
import { desc, eq } from "drizzle-orm";
import { logDashboardError } from "../../lib/dashboard-runtime";
import {
  buildDashboardRuntimeMetadata,
  runtimeCommitMismatch,
} from "../../lib/runtime-identity";

export const dynamic = "force-dynamic";

type Heartbeat = Awaited<ReturnType<typeof getSystemHeartbeat>>;

async function loadRecoveryState() {
  const db = getDb();
  const [
    botRuntime,
    whatsappClient,
    whatsappSend,
    whatsappLoopGuard,
    scheduler,
  ] = await Promise.all([
    getSystemHeartbeat(db, "bot-runtime"),
    getSystemHeartbeat(db, "whatsapp-client"),
    getSystemHeartbeat(db, "whatsapp-send"),
    getSystemHeartbeat(db, "whatsapp-loop-guard"),
    getSystemHeartbeat(db, "bot-scheduler"),
  ]);

  let recoveryActionRows: Array<typeof auditLog.$inferSelect> = [];
  let recoveryActionWarning: string | null = null;
  try {
    recoveryActionRows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.tool, "whatsapp_recovery_action"))
      .orderBy(desc(auditLog.createdAt))
      .limit(8);
  } catch (e) {
    logDashboardError("whatsapp-recovery.actions", e);
    recoveryActionWarning = "Recovery action log is unavailable. Health signals are still shown.";
  }

  return {
    dashboardRuntime: buildDashboardRuntimeMetadata(process.env),
    botRuntime,
    whatsappClient,
    whatsappClientFreshness: classifyHeartbeat(whatsappClient, new Date(), 2 * 60 * 1000),
    whatsappSend,
    whatsappSendFreshness: classifyHeartbeat(whatsappSend, new Date(), 10 * 60 * 1000),
    whatsappLoopGuard,
    whatsappLoopGuardFreshness: classifyHeartbeat(whatsappLoopGuard, new Date(), 10 * 60 * 1000),
    scheduler,
    schedulerFreshness: classifyHeartbeat(scheduler, new Date()),
    recoveryActions: recoveryActionRows,
    recoveryActionWarning,
  };
}

function metadataText(heartbeat: Heartbeat, key: string): string | null {
  const value = heartbeat?.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.slice(0, 160) : null;
}

function statusTone(ok: boolean): string {
  return ok ? "text-emerald-300" : "text-amber-300";
}

function CheckRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div className="grid gap-2 border-t border-slate-800 px-4 py-3 text-sm md:grid-cols-[220px_100px_1fr]">
      <div className="font-medium text-slate-100">{label}</div>
      <div className={statusTone(ok)}>{ok ? "OK" : "Check"}</div>
      <div className="text-slate-400">{detail}</div>
    </div>
  );
}

const recoveryActions = [
  ["railway_auth_checked", "Railway auth checked"],
  ["railway_restarted", "Railway restart marked"],
  ["phone_proof_started", "Phone proof started"],
  ["phone_proof_passed", "Phone proof passed"],
  ["phone_proof_failed", "Phone proof failed"],
] as const;

const phoneProofSteps = [
  ["hi", "Basic reply"],
  ["pending items", "Queue status"],
  ["voice: what is the weather tomorrow?", "Voice, transcription, weather context"],
  ["hear it", "Repeat/replay"],
  ["send a message to someone", "Risk confirmation"],
] as const;

const operatorCommands = [
  ["Local proof, no Railway", "pnpm run whatsapp:proof-local"],
  ["Railway access check", "pnpm run railway:preflight"],
  ["Loop guard reset", "resume whatsapp"],
] as const;

function recoveryActionLabel(action: unknown): string {
  const found = recoveryActions.find(([value]) => value === action);
  return found?.[1] ?? "Recovery action";
}

function recoveryActionValue(input: Record<string, unknown> | null): string | null {
  const action = input?.action;
  return typeof action === "string" ? action : null;
}

export default async function WhatsAppRecoveryPage() {
  let state: Awaited<ReturnType<typeof loadRecoveryState>> | null = null;
  let error: string | null = null;

  try {
    state = await loadRecoveryState();
  } catch (e) {
    logDashboardError("whatsapp-recovery.load", e);
    error = "Could not load WhatsApp recovery state. Check database and dashboard env.";
  }

  const botCommit = state
    ? metadataText(state.botRuntime, "commitShort") ?? metadataText(state.botRuntime, "commit") ?? "unknown"
    : "unknown";
  const dashboardCommit = state?.dashboardRuntime.commitShort ?? "unknown";
  const versionMismatch = state ? runtimeCommitMismatch(state.dashboardRuntime.commit, state.botRuntime) : false;
  const loopPaused = state?.whatsappLoopGuard?.status === "paused";
  const sendFailed = state?.whatsappSend?.status === "error";
  const clientFresh = state?.whatsappClientFreshness === "ok" && state.whatsappClient?.status === "ok";
  const loopReason = state ? metadataText(state.whatsappLoopGuard, "reason") : null;
  const loopResetAt = state ? metadataText(state.whatsappLoopGuard, "resetAt") : null;
  const sendError = state ? metadataText(state.whatsappSend, "error") : null;

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Operations</div>
        <h2 className="mt-2 text-3xl font-semibold">WhatsApp Recovery</h2>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">
          One place to work out whether WhatsApp is blocked by Railway, stale bot code, loop guard, send failure, or phone proof.
        </p>
        <div className="mt-5 grid gap-3 text-sm md:grid-cols-3">
          {operatorCommands.map(([label, command]) => (
            <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/45 p-3">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{label}</div>
              <code className="mt-2 block overflow-x-auto whitespace-nowrap rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100">
                {command}
              </code>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href="/health" className="nc-button-primary">Open health</a>
          <a href="/api/healthz" className="nc-button">Check API health</a>
          <a href="/queue" className="nc-button">Open requests</a>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-700/40 bg-red-950/20 p-4 text-sm text-red-300">{error}</div>
      ) : null}

      {versionMismatch ? (
        <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-4 text-sm">
          <p className="font-medium text-amber-300">Railway bot worker may be stale</p>
          <p className="mt-1 text-xs text-amber-400/75">
            Dashboard commit: {dashboardCommit} | Bot commit: {botCommit}. Restart or redeploy Railway, then refresh this page.
          </p>
        </div>
      ) : null}

      <section className="nc-section">
        <div className="nc-eyebrow">Recovery signals</div>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/45">
          <CheckRow
            label="Dashboard deployment"
            ok={Boolean(state)}
            detail={`Dashboard commit: ${dashboardCommit}`}
          />
          <CheckRow
            label="Railway bot worker"
            ok={Boolean(state?.botRuntime)}
            detail={`Bot commit: ${botCommit}. ${state?.botRuntime ? "Runtime heartbeat exists." : "No bot-runtime heartbeat yet."}`}
          />
          <CheckRow
            label="Version match"
            ok={!versionMismatch}
            detail={versionMismatch ? "Railway is probably running older bot code." : "No dashboard/bot commit mismatch detected."}
          />
          <CheckRow
            label="WhatsApp client"
            ok={Boolean(clientFresh)}
            detail={state?.whatsappClient ? `Status: ${state.whatsappClient.status}` : "No WhatsApp client heartbeat."}
          />
          <CheckRow
            label="Reply delivery"
            ok={!sendFailed}
            detail={sendFailed ? `Last send failure: ${sendError ?? "No detail"}` : "No active send failure recorded."}
          />
          <CheckRow
            label="Loop guard"
            ok={!loopPaused}
            detail={
              loopPaused
                ? `Paused: ${loopReason ?? "No reason"}${loopResetAt ? ` | Auto-reset: ${loopResetAt}` : ""}`
                : "No active loop pause recorded."
            }
          />
          <CheckRow
            label="Scheduler"
            ok={state?.schedulerFreshness === "ok"}
            detail={state?.scheduler ? `Status: ${state.scheduler.status}` : "No scheduler heartbeat."}
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="nc-section">
          <div className="nc-eyebrow">Phone proof script</div>
          <ol className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/45 text-sm">
            {phoneProofSteps.map(([command, purpose], index) => (
              <li key={command} className="grid gap-2 border-t border-slate-800 px-4 py-3 md:grid-cols-[32px_1fr_1fr]">
                <span className="text-slate-500">{index + 1}</span>
                <code className="text-slate-100">{command}</code>
                <span className="text-slate-400">{purpose}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-slate-500">
            Expected result: normal replies work, voice is transcribed, replay works, and risky actions ask for confirmation.
          </p>
        </div>

        <div className="nc-section">
          <div className="nc-eyebrow">What each failure means</div>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <p><span className="font-medium text-slate-100">No reply:</span> Railway bot is down, stale, disconnected, or not authenticated to WhatsApp.</p>
            <p><span className="font-medium text-slate-100">Loop guard warning:</span> send <span className="font-mono text-slate-100">resume whatsapp</span>, wait for the resumed reply, then repeat the proof.</p>
            <p><span className="font-medium text-slate-100">Send failure:</span> WhatsApp client is not ready or the session needs repair.</p>
            <p><span className="font-medium text-slate-100">Version mismatch:</span> Vercel deployed but Railway did not redeploy the bot worker.</p>
            <p><span className="font-medium text-slate-100">Voice fails:</span> check transcription model/API keys and media handling.</p>
          </div>
        </div>
      </section>

      <section className="nc-section">
        <div className="nc-eyebrow">Recovery action log</div>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Use these fixed buttons tomorrow so recovery attempts are recorded without storing freeform private data.
        </p>
        {state?.recoveryActionWarning ? (
          <div className="mt-4 rounded-xl border border-amber-700/40 bg-amber-950/20 p-3 text-sm text-amber-300">
            {state.recoveryActionWarning}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {recoveryActions.map(([value, label]) => (
            <form key={value} action="/api/whatsapp-recovery/log-action" method="post">
              <input type="hidden" name="action" value={value} />
              <button type="submit" className="nc-button min-h-9 px-3 text-xs">
                {label}
              </button>
            </form>
          ))}
        </div>
        <div className="mt-5 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/45">
          {(state?.recoveryActions.length ?? 0) > 0 ? (
            state?.recoveryActions.map((entry) => {
              const action = recoveryActionValue(entry.input);
              return (
                <div key={entry.id} className="grid gap-2 border-t border-slate-800 px-4 py-3 text-sm md:grid-cols-[220px_100px_1fr]">
                  <div className="font-medium text-slate-100">{recoveryActionLabel(action)}</div>
                  <div className={entry.success ? "text-emerald-300" : "text-red-300"}>
                    {entry.success ? "logged" : "failed"}
                  </div>
                  <div className="text-slate-400">{new Date(entry.createdAt).toLocaleString()}</div>
                </div>
              );
            })
          ) : (
            <div className="px-4 py-3 text-sm text-slate-400">No recovery actions logged yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}
