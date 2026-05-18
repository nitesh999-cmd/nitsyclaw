import { revalidatePath } from "next/cache";
import { getDb, confirmations, restorePendingConfirmation, setConfirmationStatus } from "@nitsyclaw/shared/db";
import { createPrivateSpotifyPlaylist } from "@nitsyclaw/shared/integrations/spotify";
import { desc, eq } from "drizzle-orm";
import { logDashboardLoadError } from "../../lib/dashboard-runtime";

export const dynamic = "force-dynamic";

type RiskLevel = "low" | "medium" | "high" | "review";

type ApprovalProfile = {
  label: string;
  risk: RiskLevel;
  riskReason: string;
  undoNote: string;
  dashboardApprove: "supported" | "whatsapp";
};

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
  try {
    await createPrivateSpotifyPlaylist(db, payload.ownerHash ?? "", {
      name: payload.name,
      description: payload.description,
      uris: payload.uris,
    });
  } catch (e) {
    await restorePendingConfirmation(db, id);
    throw e;
  }
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

function riskBadge(risk: RiskLevel) {
  const cls =
    risk === "high"
      ? "border-red-500/40 bg-red-950/20 text-red-200"
      : risk === "medium"
        ? "border-amber-500/40 bg-amber-950/20 text-amber-200"
        : risk === "low"
          ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-200"
          : "border-slate-600 bg-slate-900/50 text-slate-300";
  return `rounded border px-2 py-1 text-xs ${cls}`;
}

function approvalProfile(action: string): ApprovalProfile {
  if (action === "create_calendar_event") {
    return {
      label: "Calendar event",
      risk: "high",
      riskReason: "Changes an external calendar and may involve other people.",
      undoNote:
        "Delete or reschedule the created event in the calendar provider; local approval cannot undo provider changes automatically.",
      dashboardApprove: "whatsapp",
    };
  }
  if (action === "spotify_create_playlist") {
    return {
      label: "Spotify playlist",
      risk: "medium",
      riskReason: "Creates a private playlist in the connected Spotify account.",
      undoNote: "Remove the playlist in Spotify if unwanted; local approval cannot undo provider changes automatically.",
      dashboardApprove: "supported",
    };
  }
  if (action === "email_create_draft") {
    return {
      label: "Email draft",
      risk: "medium",
      riskReason: "Creates a mailbox draft. It does not send email.",
      undoNote: "Delete the draft in the mailbox if unwanted. Nothing is sent until a separate send confirmation exists.",
      dashboardApprove: "whatsapp",
    };
  }
  return {
    label: action.replaceAll("_", " "),
    risk: "review",
    riskReason: "Unknown action type. Review in WhatsApp before approving.",
    undoNote: "Reject if unclear. Unknown actions should not be approved from dashboard.",
    dashboardApprove: "whatsapp",
  };
}

function expiryText(expiresAt: Date, now: Date) {
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return "Expiry unknown";
  if (expiry < now) return `Expired ${expiry.toLocaleString()}`;
  const minutes = Math.max(1, Math.ceil((expiry.getTime() - now.getTime()) / 60_000));
  if (minutes < 60) return `Expires in ${minutes} min`;
  const hours = Math.ceil(minutes / 60);
  return `Expires in ${hours} hr`;
}

function safeString(value: unknown, max = 80) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}...` : trimmed;
}

function summaryList(action: string, payload: Record<string, unknown>): string[] {
  if (action === "create_calendar_event") {
    const participants = Array.isArray(payload.participants) ? `${payload.participants.length} participant(s)` : "none";
    return [
      `Title: ${safeString(payload.title) ?? "untitled"}`,
      `Start: ${safeString(payload.start) ?? "not set"}`,
      `Duration: ${typeof payload.durationMin === "number" ? `${payload.durationMin} min` : "not set"}`,
      `Participants: ${participants}`,
      `Calendar: ${safeString(payload.calendar) ?? "default"}`,
    ];
  }
  if (action === "spotify_create_playlist") {
    return [
      `Playlist: ${safeString(payload.name) ?? "untitled"}`,
      `Tracks: ${Array.isArray(payload.uris) ? payload.uris.length : 0}`,
      `Description: ${safeString(payload.description) ? "present" : "none"}`,
    ];
  }
  if (action === "email_create_draft" || payload.createdFrom === "queue_email_draft_creation") {
    const copy = payload;
    return [
      `Provider: ${safeString(copy.provider) ?? "mailbox"}`,
      `To: ${Array.isArray(copy.to) ? `${copy.to.length} recipient(s)` : "not set"}`,
      `CC: ${Array.isArray(copy.cc) ? `${copy.cc.length} cc recipient(s)` : "none"}`,
      `BCC: ${Array.isArray(copy.bcc) ? `${copy.bcc.length} bcc recipient(s)` : "none"}`,
      "Subject: [redacted]",
      "Body: [redacted]",
    ];
  }
  const sensitive = new Set([
    "accessToken",
    "refreshToken",
    "token",
    "secret",
    "password",
    "ownerHash",
    "body",
    "message",
    "content",
  ]);
  return Object.entries(payload)
    .filter(([key, value]) => !sensitive.has(key) && ["string", "number", "boolean"].includes(typeof value))
    .slice(0, 5)
    .map(([key, value]) => `${key}: ${String(value).slice(0, 80)}`);
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
  if (copy.ownerHash) delete copy.ownerHash;
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
  let hasLoadError = false;
  try {
    rows = await loadConfirmations();
  } catch (e) {
    logDashboardLoadError("confirmations.page", e);
    hasLoadError = true;
  }

  const pending = rows.filter((r) => r.status === "pending");
  const now = new Date();

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Safety gate</div>
        <h2 className="mt-2 text-3xl font-semibold">Confirmations</h2>
        <p className="mt-3 text-sm text-slate-400">
          Important actions wait here with risk, summary, expiry, and undo context before anything external changes.
          {pending.length > 0 && (
            <span className="ml-2 rounded border border-amber-500/40 px-2 py-0.5 text-xs text-amber-300">
              {pending.length} pending
            </span>
          )}
        </p>
      </section>

      {hasLoadError ? (
        <div className="border border-red-900 bg-red-950/30 p-3 text-sm text-red-200" role="alert">
          Confirmations are not available right now. Try again shortly.
        </div>
      ) : null}

      {rows.length === 0 ? (
        <section className="nc-section">
          <p className="nc-muted">No confirmations yet. Important actions will appear here.</p>
        </section>
      ) : (
        <section className="nc-section">
          <div className="space-y-3">
            {rows.map((row) => {
              const payload = row.payload as Record<string, unknown>;
              const profile = approvalProfile(row.action);
              const expired = row.expiresAt < now;
              const summary = summaryList(row.action, payload);
              return (
                <div key={row.id} className="rounded border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={badge(row.status)}>{row.status}</span>
                    <span className={riskBadge(profile.risk)}>Risk: {profile.risk}</span>
                    <span className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300">
                      {profile.label}
                    </span>
                    <span className={`text-xs ${expired ? "text-red-300" : "text-slate-400"}`}>
                      {expiryText(row.expiresAt, now)}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_260px]">
                    <div>
                      <div className="text-sm font-medium text-slate-100">{row.action}</div>
                      <div className="mt-2 text-xs text-slate-400">Risk reason: {profile.riskReason}</div>
                      <div className="mt-3 grid gap-1 text-xs text-slate-300 sm:grid-cols-2">
                        {summary.map((item) => (
                          <div key={item} className="rounded border border-slate-800 bg-slate-950/60 px-2 py-1">
                            {item}
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 text-xs text-slate-500 break-all" aria-label="redacted payload summary">
                        Payload: {summarize(payload)}
                      </div>
                      <div className="mt-2 text-xs text-slate-400">Undo: {profile.undoNote}</div>
                      <div className="mt-2 text-xs text-slate-500">
                        Created {new Date(row.createdAt).toLocaleString()} - Expires{" "}
                        {new Date(row.expiresAt).toLocaleString()}
                      </div>
                      <div className="mt-1 select-all text-xs text-slate-500">ID: {row.id}</div>
                    </div>

                    <div className="flex flex-col gap-2">
                      {row.status === "pending" && profile.dashboardApprove === "supported" ? (
                        <form action={approveSpotifyConfirmation}>
                          <input type="hidden" name="id" value={row.id} />
                          <button className="w-full rounded border border-emerald-800/60 px-3 py-2 text-xs text-emerald-200 hover:border-emerald-500 hover:bg-emerald-950/30">
                            Approve safely
                          </button>
                        </form>
                      ) : null}
                      {row.status === "pending" && profile.dashboardApprove === "whatsapp" ? (
                        <div className="rounded border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
                          Use WhatsApp approval with the exact confirmation ID. Dashboard approval is disabled for this
                          action until its provider adapter is available here.
                        </div>
                      ) : null}
                      {row.status === "pending" ? (
                        <form action={rejectConfirmation}>
                          <input type="hidden" name="id" value={row.id} />
                          <button className="w-full rounded border border-red-900/60 px-3 py-2 text-xs text-red-200 hover:border-red-600 hover:bg-red-950/30">
                            Reject
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
