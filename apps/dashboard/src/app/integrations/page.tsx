import Link from "next/link";
import { getConnectedAccount, getDb } from "@nitsyclaw/shared/db";
import { getOwnerIdentity } from "../../lib/dashboard-runtime";

export const dynamic = "force-dynamic";

interface IntegrationRow {
  name: string;
  status: "Connected" | "Needs setup" | "Blocked" | "Read-only" | "Local only" | "Partial";
  detail: string;
  setupChecklist?: string[];
  whatsapp?: string;
  action?: { href: string; label: string };
  disconnectAction?: { action: string; label: string };
}

async function loadRows(): Promise<IntegrationRow[]> {
  const rows: IntegrationRow[] = [
    {
      name: "WhatsApp",
      status: "Local only",
      detail: "Personal WhatsApp Web session on the always-on laptop.",
      whatsapp: "proof test",
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
      setupChecklist: [
        "Create or confirm Google OAuth credentials.",
        "Grant Gmail read/draft/send scopes only when you are ready.",
        "Keep send actions behind confirmation.",
      ],
      whatsapp: "connect Gmail so you can draft replies",
    },
    {
      name: "Outlook / M365",
      status: "Partial",
      detail: "Unread/calendar read available. Mail.Send is now wired — re-run device-code auth on the bot to grant the scope.",
      setupChecklist: [
        "Create or confirm the Azure app registration.",
        "Run device-code auth for the bot account.",
        "Verify Mail.Send and Calendar scopes before claiming live actions.",
      ],
      whatsapp: "connect Outlook so you can search my mailbox",
      action: { href: "https://docs.microsoft.com/en-us/graph/auth-v2-user", label: "Re-auth guide →" },
    },
    {
      name: "Google / Outlook Calendar",
      status: "Partial",
      detail: "Calendar context and confirmed event creation are supported where tokens are healthy. Connection-health checks are queued next.",
      setupChecklist: [
        "Verify provider token health.",
        "Keep event creation confirmation-gated.",
        "Show calendar name before any external change.",
      ],
      whatsapp: "remind me to call Mukesh tomorrow at 10 am",
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
    setupChecklist: spotifyConnected
      ? ["Run a top-tracks proof.", "Keep playlist creation private and confirmation-gated."]
      : ["Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI.", "Connect Spotify OAuth.", "Run a top-tracks proof before claiming live actions."],
    whatsapp: spotifyConnected ? "what are my top Spotify tracks?" : "create suggested playlist in Spotify",
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
      setupChecklist: [
        "Connect Google OAuth.",
        "Use selected-file permissions first.",
        "Show filename/source before summarising private files.",
      ],
      whatsapp: "browse my Google Drive files",
    },
    {
      name: "Google Photos",
      status: "Needs setup",
      detail: "Selected-media requests can be queued now; Picker import is next.",
      setupChecklist: [
        "Connect Google OAuth with Photos consent.",
        "Prefer picker/selected-library access.",
        "Avoid broad background photo scanning.",
      ],
      whatsapp: "set up Google Photos search for family pictures",
    },
    {
      name: "Phone/SMS",
      status: "Needs setup",
      detail: "SMS copy and call-prep requests work now. Sending/calling needs Twilio or a phone companion.",
      setupChecklist: [
        "Choose provider or phone companion.",
        "Require exact contact confirmation before send/call.",
        "Keep drafts available even before provider setup.",
      ],
      whatsapp: "draft sms to John saying I am running late",
    },
    {
      name: "Contacts & birthdays",
      status: "Needs setup",
      detail: "Manual/CSV/calendar/contact import requests can be queued. Review/delete controls are needed before broad import.",
      whatsapp: "import birthdays from contacts",
    },
    {
      name: "Bank feeds",
      status: "Blocked",
      detail: "Live feeds need a compliant provider and consent flow. CSV import requests can be queued now.",
      setupChecklist: [
        "Choose a compliant bank-data provider.",
        "Build consent, retry, dedupe, and revoke flow.",
        "Use CSV import until live consent is real.",
      ],
      whatsapp: "connect bank feeds for expenses",
    },
    {
      name: "Facebook birthdays",
      status: "Blocked",
      detail: "Contacts, calendar, CSV, or manual import requests can be queued. Do not rely on scraping Facebook.",
      whatsapp: "connect Facebook birthdays",
    },
    {
      name: "Social video analysis",
      status: "Partial",
      detail: "Public URL/upload analysis requests can be queued. Deeper comments/metadata need platform APIs.",
      setupChecklist: [
        "Start with public URL/upload analysis.",
        "Do not scrape private accounts.",
        "Add official API adapters only after approval.",
      ],
      whatsapp: "analyse this Instagram reel https://example.com/reel/1",
    },
    {
      name: "Fuel prices",
      status: "Needs setup",
      detail: "Location/fuel/loyalty requests can be queued. Exact live station prices need a trusted regional data feed.",
      whatsapp: "find cheaper fuel near Point Cook",
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
        <p className="mt-2 text-sm text-slate-400">
          Use the WhatsApp phrase on each row to queue setup safely. A queued request is not the same as a connected account.
        </p>
        <div className="mt-4 rounded-xl border border-stone-200 bg-[#fbf8f2] p-3 text-sm leading-6 text-stone-700">
          Best order: email PA first for daily value, Spotify for a quick demo, Phone/SMS only after wrong-recipient safeguards.
        </div>
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
            <div key={row.name} className="grid gap-3 py-4 md:grid-cols-[180px_120px_1fr_220px_auto] md:items-start">
              <div className="font-medium text-slate-100">{row.name}</div>
              <div><span className={badge(row.status)}>{row.status}</span></div>
              <div className="text-sm text-slate-400">
                <p>{row.detail}</p>
                {row.setupChecklist?.length ? (
                  <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-500">
                    {row.setupChecklist.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="text-xs text-slate-500">
                {row.whatsapp ? (
                  <>
                    WhatsApp: <span className="font-mono text-slate-300">{row.whatsapp}</span>
                  </>
                ) : null}
              </div>
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
