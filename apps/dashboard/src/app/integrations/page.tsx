import Link from "next/link";
import { getConnectedAccount, getDb } from "@nitsyclaw/shared/db";
import { getOwnerIdentity } from "../../lib/dashboard-runtime";

export const dynamic = "force-dynamic";

interface IntegrationRow {
  name: string;
  status: "Connected" | "Needs setup" | "Blocked" | "Read-only" | "Local only" | "Partial";
  detail: string;
  action?: { href: string; label: string };
  disconnectAction?: { action: string; label: string };
}

async function loadRows(): Promise<IntegrationRow[]> {
  const rows: IntegrationRow[] = [
    {
      name: "WhatsApp",
      status: "Local only",
      detail: "Personal WhatsApp Web session on the always-on laptop.",
    },
    {
      name: "Anthropic",
      status: process.env.ANTHROPIC_API_KEY ? "Connected" : "Needs setup",
      detail: "Main reasoning model for chat/tool use.",
    },
    {
      name: "OpenAI",
      status: process.env.OPENAI_API_KEY ? "Connected" : "Needs setup",
      detail: "Voice transcription and embeddings.",
    },
    {
      name: "Gmail",
      status: "Partial",
      detail: "Unread/search and confirmation-gated draft requests are available; sending needs gmail.send re-auth.",
    },
    {
      name: "Outlook / M365",
      status: "Partial",
      detail: "Unread/calendar read available. Mail.Send is now wired — re-run device-code auth on the bot to grant the scope.",
      action: { href: "https://docs.microsoft.com/en-us/graph/auth-v2-user", label: "Re-auth guide →" },
    },
  ];

  const spotifyConfigured = Boolean(
    process.env.SPOTIFY_CLIENT_ID &&
      process.env.SPOTIFY_CLIENT_SECRET &&
      process.env.SPOTIFY_REDIRECT_URI,
  );
  let spotifyConnected = false;
  try {
    if (spotifyConfigured) {
      const db = getDb();
      const { ownerHash } = getOwnerIdentity();
      spotifyConnected = Boolean(
        await getConnectedAccount(db, {
          provider: "spotify",
          ownerHash,
        }),
      );
    }
  } catch {
    spotifyConnected = false;
  }

  rows.push({
    name: "Spotify",
    status: !spotifyConfigured ? "Needs setup" : spotifyConnected ? "Connected" : "Needs setup",
    detail: !spotifyConfigured
      ? "Add Spotify env vars, then connect the account."
      : spotifyConnected
        ? "Ready for top tracks, search, and confirmed private playlist creation."
        : "Server configured. Connect Spotify OAuth to activate tools.",
    action: spotifyConfigured && !spotifyConnected
      ? { href: "/api/integrations/spotify/connect", label: "Connect Spotify" }
      : undefined,
    disconnectAction: spotifyConfigured && spotifyConnected
      ? { action: "/api/integrations/spotify/disconnect", label: "Disconnect Spotify" }
      : undefined,
  });

  rows.push(
    {
      name: "Google Drive",
      status: "Needs setup",
      detail: "Selected file/link requests can be queued now; OAuth file import is next.",
    },
    {
      name: "Google Photos",
      status: "Needs setup",
      detail: "Selected-media requests can be queued now; Picker import is next.",
    },
    {
      name: "Phone/SMS",
      status: "Needs setup",
      detail: "SMS copy and call-prep requests work now. Sending/calling needs Twilio or a phone companion.",
    },
    {
      name: "Bank feeds",
      status: "Blocked",
      detail: "Live feeds need a compliant provider and consent flow. CSV import requests can be queued now.",
    },
    {
      name: "Facebook birthdays",
      status: "Blocked",
      detail: "Contacts, calendar, CSV, or manual import requests can be queued. Do not rely on scraping Facebook.",
    },
    {
      name: "Social video analysis",
      status: "Partial",
      detail: "Public URL/upload analysis requests can be queued. Deeper comments/metadata need platform APIs.",
    },
  );

  return rows;
}

function badge(status: IntegrationRow["status"]) {
  const cls =
    status === "Connected"
      ? "border-emerald-500/40 text-emerald-300"
      : status === "Read-only"
        ? "border-sky-500/40 text-sky-300"
        : status === "Partial"
          ? "border-violet-500/40 text-violet-300"
        : status === "Local only"
          ? "border-amber-500/40 text-amber-300"
          : status === "Blocked"
            ? "border-red-500/40 text-red-300"
            : "border-slate-700 text-slate-400";
  return `rounded border px-2 py-1 text-xs ${cls}`;
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ spotify?: string }>;
}) {
  const params = await searchParams;
  const rows = await loadRows();

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Services &amp; access</div>
        <h2 className="mt-2 text-3xl font-semibold">Integrations</h2>
        <p className="mt-3 text-sm text-slate-400">
          NitsyClaw asks before sending, deleting, scheduling, or changing anything important.
        </p>
      </section>

      {params?.spotify === "revoke-failed" ? (
        <div className="border border-red-900 bg-red-950/30 p-3 text-sm text-red-200" role="alert">
          Spotify disconnect failed at the provider. The local token is kept so you can retry safely.
        </div>
      ) : params?.spotify === "disconnected" ? (
        <div className="border border-emerald-900 bg-emerald-950/30 p-3 text-sm text-emerald-200" role="status">
          Spotify disconnected.
        </div>
      ) : null}

      <section className="nc-section">
        <div className="divide-y divide-slate-800 border-y border-slate-800">
          {rows.map((row) => (
            <div key={row.name} className="grid gap-3 py-4 md:grid-cols-[180px_120px_1fr_auto] md:items-center">
              <div className="font-medium text-slate-100">{row.name}</div>
              <div><span className={badge(row.status)}>{row.status}</span></div>
              <div className="text-sm text-slate-400">{row.detail}</div>
              <div className="flex flex-wrap gap-3">
                {row.action ? (
                  <Link className="text-sm text-[#d8b75d] hover:text-[#f1d58a]" href={row.action.href}>
                    {row.action.label}
                  </Link>
                ) : null}
                {row.disconnectAction ? (
                  <form action={row.disconnectAction.action} method="post">
                    <button className="text-sm text-red-300 hover:text-red-200">
                      {row.disconnectAction.label}
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
