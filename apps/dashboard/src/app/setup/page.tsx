import Link from "next/link";
import { getConnectedAccount, getDb } from "@nitsyclaw/shared/db";
import { getOwnerIdentity } from "../../lib/dashboard-runtime";
import {
  dashboardStatus,
  getProviderSetupReadiness,
  type ProviderSetupReadiness,
} from "../../lib/provider-setup-readiness";

export const dynamic = "force-dynamic";

const SETUP_ORDER = [
  "gmail",
  "outlook",
  "spotify",
  "drive",
  "photos",
  "phone-sms",
  "bank-feeds",
  "birthdays",
  "social-video",
] as const;

const WHY_THIS_ORDER: Record<string, string> = {
  gmail: "Email PA is the highest daily-use value: find, summarise, draft, and follow up.",
  outlook: "Outlook is useful for work mail and calendar context, but must stay approval-gated.",
  spotify: "Spotify is a quick low-risk demo that makes the assistant feel personal.",
  drive: "Drive should start with selected-file access, not broad background browsing.",
  photos: "Photos need selected-library or picker access before any private search claims.",
  "phone-sms": "Phone/SMS can cause wrong-recipient damage, so provider choice and confirmation rules come first.",
  "bank-feeds": "Bank feeds need compliant consent, revoke controls, and dedupe before live import.",
  birthdays: "Birthdays should start from manual/CSV/contact import, not social scraping.",
  "social-video": "Public URL/upload analysis is safer than private platform access.",
};

const WHAT_TO_TEST: Record<string, string> = {
  gmail: "Ask WhatsApp: draft an email reply, then confirm it stayed as a draft.",
  outlook: "Ask WhatsApp: what is on my calendar today, then verify no event was changed.",
  spotify: "Ask WhatsApp: what are my top Spotify tracks?",
  drive: "Upload or paste one selected file/link and ask for a summary.",
  photos: "Choose a small selected media set before asking for photo search.",
  "phone-sms": "Ask for an SMS draft and confirm it does not send automatically.",
  "bank-feeds": "Import a CSV first and check duplicates are not created.",
  birthdays: "Import a small CSV/contact list and check review/delete controls.",
  "social-video": "Paste a public URL and verify the summary names the source.",
};

async function loadSetupReadiness(): Promise<ProviderSetupReadiness[]> {
  let spotifyConnected = false;
  let spotifyExpiresAt: Date | null = null;
  let spotifyHasRefreshToken = false;

  try {
    const db = getDb();
    const { ownerHash } = getOwnerIdentity();
    const spotify = await getConnectedAccount(db, { provider: "spotify", ownerHash });
    spotifyConnected = Boolean(spotify);
    spotifyExpiresAt = spotify?.expiresAt ?? null;
    spotifyHasRefreshToken = Boolean(spotify?.refreshToken);
  } catch {
    spotifyConnected = false;
    spotifyExpiresAt = null;
    spotifyHasRefreshToken = false;
  }

  const readiness = getProviderSetupReadiness(process.env, {
    spotifyConnected,
    spotifyExpiresAt,
    spotifyHasRefreshToken,
  });
  const byKey = new Map(readiness.map((item) => [item.key, item]));
  return SETUP_ORDER.map((key) => byKey.get(key)).filter((item): item is ProviderSetupReadiness => Boolean(item));
}

function statusClass(item: ProviderSetupReadiness): string {
  if (item.status === "ready" || item.status === "partial") return "border-emerald-500/40 text-emerald-300";
  if (item.status === "blocked") return "border-red-500/40 text-red-300";
  if (item.status === "approval_required" || item.status === "needs_account") return "border-amber-500/40 text-amber-300";
  return "border-slate-700 text-slate-400";
}

export default async function SetupPage() {
  const readiness = await loadSetupReadiness();
  const readyCount = readiness.filter((item) => item.status === "ready" || item.status === "partial").length;
  const blockedCount = readiness.filter((item) => item.status === "blocked").length;
  const accountCount = readiness.filter((item) => item.status === "needs_account").length;

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Setup</div>
        <h1 className="mt-2 max-w-3xl text-3xl font-semibold leading-tight md:text-5xl">
          Connect one useful thing at a time.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 md:text-base">
          NitsyClaw can already handle local life admin. External actions need real account access, scoped permissions,
          and confirmation gates before they are safe to use.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/integrations" className="nc-button-primary">Manage connections</Link>
          <Link href="/health" className="nc-button">Check health</Link>
          <Link href="/chat" className="nc-button">Try local tools</Link>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="nc-tile">
          <div className="nc-eyebrow">Ready or partial</div>
          <div className="mt-3 text-3xl font-semibold text-slate-100">{readyCount}</div>
          <p className="mt-2 text-xs text-slate-500">Can be tested now, still approval-gated where needed.</p>
        </div>
        <div className="nc-tile">
          <div className="nc-eyebrow">Needs account</div>
          <div className="mt-3 text-3xl font-semibold text-slate-100">{accountCount}</div>
          <p className="mt-2 text-xs text-slate-500">OAuth app exists, but user account connection is missing.</p>
        </div>
        <div className="nc-tile">
          <div className="nc-eyebrow">Blocked by provider</div>
          <div className="mt-3 text-3xl font-semibold text-slate-100">{blockedCount}</div>
          <p className="mt-2 text-xs text-slate-500">Needs consent, compliance, or a vendor decision first.</p>
        </div>
      </section>

      <section className="nc-section">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="nc-eyebrow">Best order</div>
            <h2 className="mt-2 text-2xl font-semibold text-slate-100">Build trust before broad access</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-400">
            Start with email or Spotify. Leave phone/SMS and bank feeds until safety and consent are proven.
          </p>
        </div>

        <div className="mt-5 divide-y divide-slate-800 border-y border-slate-800">
          {readiness.map((item, index) => (
            <div key={item.key} className="grid gap-4 py-5 lg:grid-cols-[48px_170px_120px_1fr_260px] lg:items-start">
              <div className="text-sm font-semibold text-[#d8b75d]">{index + 1}</div>
              <div>
                <div className="font-semibold text-slate-100">{item.label}</div>
                <div className="mt-1 text-xs text-slate-500">{dashboardStatus(item.status)}</div>
              </div>
              <div>
                <span className={`rounded border px-2 py-1 text-xs ${statusClass(item)}`}>
                  {item.status.replace(/_/g, " ")}
                </span>
              </div>
              <div className="text-sm leading-6 text-slate-400">
                <p>{item.summary}</p>
                <p className="mt-2 text-xs text-slate-500">Why now: {WHY_THIS_ORDER[item.key]}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Configured: {item.configured.length ? item.configured.join(", ") : "none detected"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Missing: {item.missing.length ? item.missing.join(", ") : "none"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs leading-5 text-slate-400">
                <div><span className="font-semibold text-slate-200">Next:</span> {item.nextStep}</div>
                <div className="mt-2"><span className="font-semibold text-slate-200">Test:</span> {WHAT_TO_TEST[item.key]}</div>
                <div className="mt-2"><span className="font-semibold text-slate-200">Safety:</span> {item.safety}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="nc-section">
          <div className="nc-eyebrow">Works without more setup</div>
          <h2 className="mt-2 text-xl font-semibold text-slate-100">Use these now</h2>
          <div className="mt-4 grid gap-2 text-sm text-slate-300">
            {[
              "Reminders and daily status",
              "AUD expenses from text, receipt photos, or CSV",
              "Bill summaries from pasted text or supported documents",
              "SMS drafts, call scripts, complaint drafts, lists, and decision notes",
              "Feature queue and proof checks from WhatsApp",
            ].map((item) => (
              <div key={item} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="nc-section">
          <div className="nc-eyebrow">Do not fake these</div>
          <h2 className="mt-2 text-xl font-semibold text-slate-100">Needs proof first</h2>
          <div className="mt-4 grid gap-2 text-sm text-slate-300">
            {[
              "Real email sending",
              "Private Drive, OneDrive, or Photos browsing",
              "Phone calls or SMS sending",
              "Bank feeds and live account data",
              "Private social account data",
            ].map((item) => (
              <div key={item} className="rounded-lg border border-red-900/50 bg-red-950/20 px-3 py-2 text-red-100">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
