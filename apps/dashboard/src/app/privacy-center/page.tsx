import {
  auditLog,
  briefs,
  confirmations,
  connectedAccounts,
  expenses,
  featureRequests,
  getDb,
  memories,
  messages,
  profileContext,
  reminders,
  systemHeartbeats,
} from "@nitsyclaw/shared/db";
import { createDataInventoryMap } from "@nitsyclaw/shared/features";
import { desc } from "drizzle-orm";
import { count } from "drizzle-orm/sql";

export const dynamic = "force-dynamic";

const DEFAULT_PRIVACY_CENTER_TIMEOUT_MS = 1_200;

type DataCountKey =
  | "messages"
  | "memories"
  | "reminders"
  | "expenses"
  | "briefs"
  | "confirmations"
  | "featureRequests"
  | "profileContext"
  | "connectedAccounts"
  | "auditLog"
  | "systemHeartbeats";

interface PrivacyCenterData {
  counts: Record<DataCountKey, number>;
  profileRows: Array<{
    key: string;
    sensitivity: string;
    source: string;
    expiresAt: Date | null;
    updatedAt: Date;
  }>;
  accountRows: Array<{
    provider: string;
    accountLabel: string;
    scope: string;
    expiresAt: Date | null;
    updatedAt: Date;
  }>;
  auditRows: Array<{
    actor: string;
    tool: string;
    success: boolean;
    durationMs: number | null;
    createdAt: Date;
  }>;
}

type InventoryRow = ReturnType<typeof createDataInventoryMap>["dataTypes"][number] & {
  count: number;
  trustNote: string;
};

type PrivacyCenterState =
  | { data: PrivacyCenterData; unavailable: false }
  | { data: null; unavailable: true };

async function loadPrivacyCenter(): Promise<PrivacyCenterData> {
  const db = getDb();
  const [
    messageCount,
    memoryCount,
    reminderCount,
    expenseCount,
    briefCount,
    confirmationCount,
    featureRequestCount,
    profileContextCount,
    connectedAccountCount,
    auditCount,
    heartbeatCount,
    profileRows,
    accountRows,
    auditRows,
  ] = await Promise.all([
    db.select({ value: count() }).from(messages),
    db.select({ value: count() }).from(memories),
    db.select({ value: count() }).from(reminders),
    db.select({ value: count() }).from(expenses),
    db.select({ value: count() }).from(briefs),
    db.select({ value: count() }).from(confirmations),
    db.select({ value: count() }).from(featureRequests),
    db.select({ value: count() }).from(profileContext),
    db.select({ value: count() }).from(connectedAccounts),
    db.select({ value: count() }).from(auditLog),
    db.select({ value: count() }).from(systemHeartbeats),
    db
      .select({
        key: profileContext.key,
        sensitivity: profileContext.sensitivity,
        source: profileContext.source,
        expiresAt: profileContext.expiresAt,
        updatedAt: profileContext.updatedAt,
      })
      .from(profileContext)
      .orderBy(desc(profileContext.updatedAt))
      .limit(25),
    db
      .select({
        provider: connectedAccounts.provider,
        accountLabel: connectedAccounts.accountLabel,
        scope: connectedAccounts.scope,
        expiresAt: connectedAccounts.expiresAt,
        updatedAt: connectedAccounts.updatedAt,
      })
      .from(connectedAccounts)
      .orderBy(desc(connectedAccounts.updatedAt))
      .limit(25),
    db
      .select({
        actor: auditLog.actor,
        tool: auditLog.tool,
        success: auditLog.success,
        durationMs: auditLog.durationMs,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt))
      .limit(20),
  ]);

  return {
    counts: {
      messages: messageCount[0]?.value ?? 0,
      memories: memoryCount[0]?.value ?? 0,
      reminders: reminderCount[0]?.value ?? 0,
      expenses: expenseCount[0]?.value ?? 0,
      briefs: briefCount[0]?.value ?? 0,
      confirmations: confirmationCount[0]?.value ?? 0,
      featureRequests: featureRequestCount[0]?.value ?? 0,
      profileContext: profileContextCount[0]?.value ?? 0,
      connectedAccounts: connectedAccountCount[0]?.value ?? 0,
      auditLog: auditCount[0]?.value ?? 0,
      systemHeartbeats: heartbeatCount[0]?.value ?? 0,
    },
    profileRows,
    accountRows,
    auditRows,
  };
}

async function loadPrivacyCenterWithTimeout(): Promise<PrivacyCenterState> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutMs = privacyCenterTimeoutMs();
  const fallback = new Promise<PrivacyCenterState>((resolve) => {
    timeout = setTimeout(() => {
      console.error("[dashboard] privacy center data load timed out; rendering safe fallback", { timeoutMs });
      resolve({ data: null, unavailable: true });
    }, timeoutMs);
  });

  try {
    const loaded = loadPrivacyCenter().then((data) => ({ data, unavailable: false }) satisfies PrivacyCenterState);
    return await Promise.race([loaded, fallback]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function privacyCenterTimeoutMs(): number {
  const parsed = Number(process.env.NITSYCLAW_PRIVACY_CENTER_TIMEOUT_MS);
  if (Number.isFinite(parsed) && parsed >= 500 && parsed <= 8_000) return parsed;
  return DEFAULT_PRIVACY_CENTER_TIMEOUT_MS;
}

export default async function PrivacyCenterPage() {
  let state: PrivacyCenterState = { data: null, unavailable: true };
  try {
    state = await loadPrivacyCenterWithTimeout();
  } catch {
    state = { data: null, unavailable: true };
  }
  const data = state.data;

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Privacy command center</div>
        <h1 className="mt-2 max-w-3xl text-3xl font-semibold leading-tight md:text-5xl">
          Your data, controls, and trust checks in one place.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 md:text-base">
          Review what NitsyClaw stores, export a copy, delete local records, inspect connected accounts,
          and confirm risky actions stay behind approval gates.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <a href="/api/data/export" className="nc-button-primary">Export my data</a>
          <a href="/settings#data-controls" className="nc-button">Delete controls</a>
          <a href="/integrations" className="nc-button">Connections</a>
        </div>
      </section>

      {state.unavailable || !data ? (
        <section className="rounded-xl border border-amber-900 bg-amber-950/30 p-4 text-sm leading-6 text-amber-200" role="status">
          <p className="font-semibold">Privacy data is temporarily unavailable.</p>
          <p className="mt-2">Export/delete controls are still available from Settings.</p>
          <ul className="mt-3 grid gap-2 text-xs text-amber-900 md:grid-cols-2">
            <li className="rounded-xl border border-amber-200 bg-amber-50 p-3">Tokens are never shown.</li>
            <li className="rounded-xl border border-amber-200 bg-amber-50 p-3">Payloads redacted.</li>
            <li className="rounded-xl border border-amber-200 bg-amber-50 p-3">Sensitive memory values stay hidden.</li>
            <li className="rounded-xl border border-amber-200 bg-amber-50 p-3">Risky actions still require approval.</li>
          </ul>
        </section>
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            <TrustTile label="Stored records" value={totalStoredRecords(data.counts)} detail="All local tables" />
            <TrustTile label="Connected accounts" value={data.counts.connectedAccounts} detail="Tokens are never shown" />
            <TrustTile label="Sensitive context keys" value={sensitiveProfileCount(data.profileRows)} detail="Values hidden on this page" />
            <TrustTile label="Recent tool calls" value={data.auditRows.length} detail="Payloads redacted" />
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="nc-section">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="nc-eyebrow">Data inventory map</div>
                  <h2 className="mt-2 text-xl font-semibold text-slate-100">What is stored and how you control it</h2>
                </div>
                <p className="max-w-md text-xs leading-5 text-slate-500">
                  This map shows source, encryption status, retention, and export/delete controls without exposing private values.
                </p>
              </div>
              <div className="mt-4 grid gap-3">
                {inventoryRows(data.counts).map((row) => (
                  <div key={row.name} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-100">{row.name}</div>
                        <p className="mt-1 text-xs leading-5 text-slate-500">Source: {row.source}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <span className="nc-pill">{row.count} stored</span>
                        <span className={row.encrypted ? "nc-pill border-emerald-500/40 text-emerald-300" : "nc-pill border-amber-500/40 text-amber-300"}>
                          {row.encrypted ? "Encrypted" : "Not encrypted"}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs leading-5 text-slate-400 md:grid-cols-3">
                      <div>
                        <span className="font-semibold text-slate-200">Retention:</span> {row.retention}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-200">Control:</span> {row.userControl}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-200">Trust note:</span> {row.trustNote}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="nc-section">
              <div className="nc-eyebrow">Retention rules</div>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
                <li><strong className="text-slate-100">Messages:</strong> pruned by the bot worker where retention is configured.</li>
                <li><strong className="text-slate-100">Memories and profile context:</strong> kept until you delete them or an expiry is set.</li>
                <li><strong className="text-slate-100">Expenses and reminders:</strong> kept until exported/deleted or completed cleanup is built.</li>
                <li><strong className="text-slate-100">Audit logs:</strong> stored as redacted operational history; raw tool payloads are not shown here.</li>
              </ul>
              <div className="mt-4 rounded-xl border border-stone-200 bg-[#fbf8f2] p-3 text-xs leading-5 text-stone-600">
                Public sale remains blocked until customer account separation, tenant-scoped export/delete,
                and reviewed privacy/legal copy are complete.
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="nc-section">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="nc-eyebrow">Sensitive memory visibility</div>
                  <p className="mt-2 text-sm text-slate-400">Shows keys and sensitivity only, not private values.</p>
                </div>
                <a href="/memory" className="text-sm font-semibold text-[#a94d2e] hover:text-[#76321d]">Review memories</a>
              </div>
              {data.profileRows.length === 0 ? (
                <p className="nc-empty">No structured profile context saved yet.</p>
              ) : (
                <ul className="divide-y divide-stone-200 border-y border-stone-200 text-sm">
                  {data.profileRows.map((row) => (
                    <li key={`${row.key}-${row.updatedAt.toISOString()}`} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div>
                        <div className="font-semibold text-slate-100">{humanKey(row.key)}</div>
                        <div className="text-xs text-slate-500">Source: {row.source}</div>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <span className={sensitivityBadge(row.sensitivity)}>{row.sensitivity}</span>
                        <span className="nc-pill">{row.expiresAt ? `Expires ${formatDate(row.expiresAt)}` : "No expiry"}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="nc-section">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="nc-eyebrow">Connected accounts</div>
                  <p className="mt-2 text-sm text-slate-400">Provider tokens stay hidden. Disconnect from Integrations.</p>
                </div>
                <a href="/integrations" className="text-sm font-semibold text-[#a94d2e] hover:text-[#76321d]">Manage</a>
              </div>
              {data.accountRows.length === 0 ? (
                <p className="nc-empty">No connected provider accounts found.</p>
              ) : (
                <ul className="divide-y divide-stone-200 border-y border-stone-200 text-sm">
                  {data.accountRows.map((row) => (
                    <li key={`${row.provider}-${row.accountLabel}`} className="py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold text-slate-100">{row.provider}</div>
                        <span className="nc-pill">{row.expiresAt ? `Expires ${formatDate(row.expiresAt)}` : "No expiry"}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">Label: {row.accountLabel}</div>
                      <div className="mt-1 text-xs text-slate-500">Scopes: {safeScopeSummary(row.scope)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="nc-section">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="nc-eyebrow">Audit review</div>
                <p className="mt-2 text-sm text-slate-400">
                  Recent tool calls without raw inputs, outputs, tokens, phone numbers, or emails.
                </p>
              </div>
              <a href="/activity" className="text-sm font-semibold text-[#a94d2e] hover:text-[#76321d]">Open activity</a>
            </div>
            {data.auditRows.length === 0 ? (
              <p className="nc-empty">No audit activity found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="border-b border-stone-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">Tool</th>
                      <th className="py-2 pr-3">Actor</th>
                      <th className="py-2 pr-3">Result</th>
                      <th className="py-2 pr-3">Duration</th>
                      <th className="py-2 pr-3">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {data.auditRows.map((row) => (
                      <tr key={`${row.tool}-${row.createdAt.toISOString()}-${row.durationMs ?? "na"}`}>
                        <td className="py-3 pr-3 font-semibold text-slate-100">{row.tool}</td>
                        <td className="py-3 pr-3 text-slate-500">{row.actor}</td>
                        <td className="py-3 pr-3">
                          <span className={row.success ? "text-emerald-700" : "text-red-700"}>
                            {row.success ? "Success" : "Failed"}
                          </span>
                        </td>
                        <td className="py-3 pr-3 text-slate-500">{row.durationMs ?? "-"} ms</td>
                        <td className="py-3 pr-3 text-slate-500">{formatDate(row.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function TrustTile({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="nc-tile">
      <div className="nc-eyebrow">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-slate-100">{value}</div>
      <div className="mt-2 text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function inventoryRows(counts: PrivacyCenterData["counts"]): InventoryRow[] {
  const countByName: Record<string, number> = {
    Messages: counts.messages,
    Memories: counts.memories + counts.profileContext,
    Reminders: counts.reminders,
    Expenses: counts.expenses,
    "Audit log": counts.auditLog,
    "Connected accounts": counts.connectedAccounts,
  };
  const trustNotes: Record<string, string> = {
    Messages: "Conversation content is private data.",
    Memories: "Profile context values are not shown on this page.",
    Reminders: "Reminder text can contain personal plans.",
    Expenses: "Expense rows may reveal health, family, or financial patterns.",
    "Audit log": "Operational metadata only; raw payloads stay hidden.",
    "Connected accounts": "Provider tokens are never displayed.",
  };

  return createDataInventoryMap().dataTypes.map((row) => ({
    ...row,
    count: countByName[row.name] ?? 0,
    trustNote: trustNotes[row.name] ?? "Review before selling to customers.",
  }));
}

function totalStoredRecords(counts: PrivacyCenterData["counts"]): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

function sensitiveProfileCount(rows: PrivacyCenterData["profileRows"]): number {
  return rows.filter((row) => row.sensitivity === "sensitive" || row.sensitivity === "personal").length;
}

function humanKey(key: string): string {
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function sensitivityBadge(sensitivity: string): string {
  if (sensitivity === "sensitive") return "nc-pill border-red-300 bg-red-50 text-red-800";
  if (sensitivity === "personal") return "nc-pill border-amber-300 bg-amber-50 text-amber-900";
  return "nc-pill border-emerald-300 bg-emerald-50 text-emerald-900";
}

function safeScopeSummary(scope: string): string {
  const parts = scope.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "No scopes recorded";
  return `${parts.length} scope${parts.length === 1 ? "" : "s"} recorded`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: process.env.TIMEZONE ?? "Australia/Melbourne",
  }).format(date);
}
