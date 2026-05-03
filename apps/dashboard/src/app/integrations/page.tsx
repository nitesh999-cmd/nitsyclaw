import Link from "next/link";
import { getConnectedAccount, getDb } from "@nitsyclaw/shared/db";
import { getOwnerIdentity } from "../../lib/dashboard-runtime";

export const dynamic = "force-dynamic";

interface IntegrationRow {
  name: string;
  status: "Connected" | "Needs setup" | "Read-only" | "Local only";
  detail: string;
  action?: { href: string; label: string };
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
      status: "Read-only",
      detail: "Unread/search are available; sending needs gmail.send re-auth.",
    },
    {
      name: "Outlook",
      status: "Read-only",
      detail: "Unread/calendar read are available; sending needs Mail.Send re-auth.",
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
  });

  rows.push(
    {
      name: "Google Drive",
      status: "Needs setup",
      detail: "Next safe path is user-selected files via drive.file, not broad Drive scanning.",
    },
    {
      name: "Google Photos",
      status: "Needs setup",
      detail: "Next safe path is Picker-selected media, not broad library scraping.",
    },
    {
      name: "Phone/SMS",
      status: "Needs setup",
      detail: "Requires Twilio or Android companion. Native iPhone/SMS logs are not exposed.",
    },
    {
      name: "Bank feeds",
      status: "Needs setup",
      detail: "Requires Basiq/Yodlee/CDR consent flow. CSV import should come first.",
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
        : status === "Local only"
          ? "border-amber-500/40 text-amber-300"
          : "border-neutral-700 text-neutral-300";
  return `rounded border px-2 py-1 text-xs ${cls}`;
}

export default async function IntegrationsPage() {
  const rows = await loadRows();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Integrations</h2>
        <p className="mt-2 text-sm text-neutral-400">
          NitsyClaw asks before sending, deleting, scheduling, or changing anything important.
        </p>
      </div>

      <div className="divide-y divide-neutral-800 border-y border-neutral-800">
        {rows.map((row) => (
          <div key={row.name} className="grid gap-3 py-4 md:grid-cols-[160px_120px_1fr_auto] md:items-center">
            <div className="font-medium">{row.name}</div>
            <div><span className={badge(row.status)}>{row.status}</span></div>
            <div className="text-sm text-neutral-400">{row.detail}</div>
            {row.action ? (
              <Link className="text-sm text-sky-300 hover:text-sky-200" href={row.action.href}>
                {row.action.label}
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
