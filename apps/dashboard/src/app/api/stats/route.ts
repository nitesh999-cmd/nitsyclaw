import { NextResponse } from "next/server";
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
import { logDashboardError } from "../../../lib/dashboard-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(): Promise<Response> {
  try {
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

    const stats = {
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

    return NextResponse.json(stats, { headers: NO_STORE });
  } catch (err) {
    logDashboardError("stats.api", err);
    return NextResponse.json(
      { error: "Stats are unavailable. Try again shortly." },
      { status: 500, headers: NO_STORE },
    );
  }
}
