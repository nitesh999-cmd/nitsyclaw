import { count, sum } from "drizzle-orm/sql";
import { eq } from "drizzle-orm";
import {
  getDb,
  messages,
  memories,
  reminders,
  expenses,
  featureRequests,
  confirmations,
} from "@nitsyclaw/shared/db";
import { logDashboardError } from "../../lib/dashboard-runtime";

export const dynamic = "force-dynamic";

interface Stats {
  messages: { total: number; in: number; out: number };
  memories: { total: number };
  reminders: { total: number; pending: number; fired: number };
  expenses: { total: number; totalAmountCents: number };
  featureRequests: { total: number; pending: number; done: number };
  confirmations: { total: number; pending: number };
}

async function loadStats(): Promise<Stats> {
  const db = getDb();

  const [
    msgTotal,
    msgIn,
    msgOut,
    memTotal,
    remTotal,
    remPending,
    remFired,
    expTotal,
    expSum,
    frTotal,
    frPending,
    frDone,
    confTotal,
    confPending,
  ] = await Promise.all([
    db.select({ value: count() }).from(messages),
    db.select({ value: count() }).from(messages).where(eq(messages.direction, "in")),
    db.select({ value: count() }).from(messages).where(eq(messages.direction, "out")),
    db.select({ value: count() }).from(memories),
    db.select({ value: count() }).from(reminders),
    db.select({ value: count() }).from(reminders).where(eq(reminders.status, "pending")),
    db.select({ value: count() }).from(reminders).where(eq(reminders.status, "fired")),
    db.select({ value: count() }).from(expenses),
    db.select({ value: sum(expenses.amount) }).from(expenses),
    db.select({ value: count() }).from(featureRequests),
    db.select({ value: count() }).from(featureRequests).where(eq(featureRequests.status, "pending")),
    db.select({ value: count() }).from(featureRequests).where(eq(featureRequests.status, "done")),
    db.select({ value: count() }).from(confirmations),
    db.select({ value: count() }).from(confirmations).where(eq(confirmations.status, "pending")),
  ]);

  return {
    messages: {
      total: msgTotal[0]?.value ?? 0,
      in: msgIn[0]?.value ?? 0,
      out: msgOut[0]?.value ?? 0,
    },
    memories: {
      total: memTotal[0]?.value ?? 0,
    },
    reminders: {
      total: remTotal[0]?.value ?? 0,
      pending: remPending[0]?.value ?? 0,
      fired: remFired[0]?.value ?? 0,
    },
    expenses: {
      total: expTotal[0]?.value ?? 0,
      totalAmountCents: Number(expSum[0]?.value ?? 0),
    },
    featureRequests: {
      total: frTotal[0]?.value ?? 0,
      pending: frPending[0]?.value ?? 0,
      done: frDone[0]?.value ?? 0,
    },
    confirmations: {
      total: confTotal[0]?.value ?? 0,
      pending: confPending[0]?.value ?? 0,
    },
  };
}

function formatAud(cents: number): string {
  return `AUD ${(cents / 100).toFixed(2)}`;
}

interface TileProps {
  label: string;
  value: number | string;
  sub?: string;
  highlight?: boolean;
}

function StatTile({ label, value, sub, highlight }: TileProps) {
  return (
    <div className="nc-tile flex flex-col gap-1">
      <div className="nc-eyebrow">{label}</div>
      <div className={`text-3xl font-semibold tabular-nums ${highlight ? "text-[#d8b75d]" : "text-slate-100"}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export default async function StatsPage() {
  let stats: Stats | null = null;
  let errorMsg: string | null = null;

  try {
    stats = await loadStats();
  } catch (err) {
    logDashboardError("stats.page", err);
    errorMsg = "Could not load stats. Try again shortly.";
  }

  if (errorMsg || !stats) {
    return (
      <div className="nc-page">
        <section className="nc-hero">
          <div className="nc-eyebrow">Overview</div>
          <h2 className="mt-2 text-3xl font-semibold">Usage Stats</h2>
        </section>
        <section className="nc-section">
          <p className="font-medium text-red-300">Stats unavailable</p>
          <p className="mt-1 text-sm text-slate-500">{errorMsg ?? "Could not load stats. Try again shortly."}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Overview</div>
        <h2 className="mt-2 text-3xl font-semibold">Usage Stats</h2>
        <p className="mt-3 text-sm text-slate-400">
          Live counts across all NitsyClaw data sources.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <StatTile label="Total messages" value={stats.messages.total} sub="all surfaces" highlight />
        <StatTile label="Inbound" value={stats.messages.in} sub="received from you" />
        <StatTile label="Outbound" value={stats.messages.out} sub="sent by NitsyClaw" />
        <StatTile label="Memories" value={stats.memories.total} sub="facts, notes, pins" />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatTile label="Pending reminders" value={stats.reminders.pending} sub={`${stats.reminders.total} total`} />
        <StatTile label="Fired reminders" value={stats.reminders.fired} sub={`${stats.reminders.total} total`} />
        <StatTile label="Total expenses" value={stats.expenses.total} sub="logged receipts" />
        <StatTile label="Total spend" value={formatAud(stats.expenses.totalAmountCents)} sub="sum of all expenses" highlight />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatTile label="Requests pending" value={stats.featureRequests.pending} sub={`${stats.featureRequests.total} total`} />
        <StatTile label="Requests done" value={stats.featureRequests.done} sub={`${stats.featureRequests.total} total`} />
        <StatTile label="Confirmations pending" value={stats.confirmations.pending} sub={`${stats.confirmations.total} total`} />
      </div>
    </div>
  );
}
