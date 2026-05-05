import { NextResponse } from "next/server";
import {
  auditLog,
  briefs,
  confirmations,
  connectedAccounts,
  dashboardAuthAttempts,
  expenses,
  featureRequests,
  getDb,
  memories,
  messages,
  profileContext,
  reminders,
  systemHeartbeats,
} from "@nitsyclaw/shared/db";
import { desc } from "drizzle-orm";
import { createExportProof, hashSession, sessionTokenFromRequest } from "../../../../lib/data-export-proof";
import {
  redactAuditExportRows,
  redactConnectedAccountExportRows,
} from "../../../../lib/data-export-redaction";
import { requireSameOrigin } from "../../../../lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;

  try {
    const db = getDb();
    const exportedAt = new Date().toISOString();
    const snapshotId = `export_${exportedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`;
    const sessionHash = hashSession(sessionTokenFromRequest(req));
    const [
      messageRows,
      memoryRows,
      reminderRows,
      expenseRows,
      briefRows,
      confirmationRows,
      auditRows,
      featureRows,
      profileRows,
      accountRows,
      heartbeatRows,
      dashboardAuthAttemptRows,
    ] = await Promise.all([
      db.select().from(messages).orderBy(desc(messages.createdAt)).limit(5001),
      db.select().from(memories).orderBy(desc(memories.createdAt)).limit(5001),
      db.select().from(reminders).orderBy(desc(reminders.createdAt)).limit(5001),
      db.select().from(expenses).orderBy(desc(expenses.createdAt)).limit(5001),
      db.select().from(briefs).orderBy(desc(briefs.createdAt)).limit(2001),
      db.select().from(confirmations).orderBy(desc(confirmations.createdAt)).limit(5001),
      db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(5001),
      db.select().from(featureRequests).orderBy(desc(featureRequests.createdAt)).limit(5001),
      db.select().from(profileContext).orderBy(desc(profileContext.updatedAt)).limit(5001),
      db.select().from(connectedAccounts).orderBy(desc(connectedAccounts.updatedAt)).limit(5001),
      db.select().from(systemHeartbeats),
      db.select().from(dashboardAuthAttempts).orderBy(desc(dashboardAuthAttempts.updatedAt)).limit(5001),
    ]);
    const caps = {
      messages: capRows(messageRows, 5000),
      memories: capRows(memoryRows, 5000),
      reminders: capRows(reminderRows, 5000),
      expenses: capRows(expenseRows, 5000),
      briefs: capRows(briefRows, 2000),
      confirmations: capRows(confirmationRows, 5000),
      auditLog: capRows(auditRows, 5000),
      featureRequests: capRows(featureRows, 5000),
      profileContext: capRows(profileRows, 5000),
      connectedAccounts: capRows(accountRows, 5000),
      systemHeartbeats: { rows: heartbeatRows, truncated: false },
      dashboardAuthAttempts: capRows(dashboardAuthAttemptRows, 5000),
    };
    const exportComplete = !Object.values(caps).some((cap) => cap.truncated);
    const counts = Object.fromEntries(
      Object.entries(caps).map(([key, cap]) => [key, cap.rows.length]),
    );
    const exportProof = createExportProof({
      snapshotId,
      exportedAt,
      complete: exportComplete,
      counts,
      sessionHash,
    });

    return NextResponse.json(
      {
        exportedAt,
        snapshotId,
        exportProof,
        exportComplete,
        format: "nitsyclaw-data-export-v1",
        limits: { perTable: 5000, briefs: 2000 },
        data: {
          messages: caps.messages.rows,
          memories: caps.memories.rows,
          reminders: caps.reminders.rows,
          expenses: caps.expenses.rows,
          briefs: caps.briefs.rows,
          confirmations: caps.confirmations.rows,
          auditLog: redactAuditExportRows(caps.auditLog.rows),
          featureRequests: caps.featureRequests.rows,
          profileContext: caps.profileContext.rows,
          connectedAccounts: redactConnectedAccountExportRows(caps.connectedAccounts.rows),
          systemHeartbeats: caps.systemHeartbeats.rows,
          dashboardAuthAttempts: redactDashboardAuthAttemptRows(caps.dashboardAuthAttempts.rows),
        },
      },
      {
        headers: {
          ...NO_STORE,
          "Content-Disposition": 'attachment; filename="nitsyclaw-data-export.json"',
        },
      },
    );
  } catch (e) {
    console.error("[data/export] failed", e);
    return NextResponse.json(
      { error: "Data export failed. Check server logs." },
      { status: 500, headers: NO_STORE },
    );
  }
}

function redactDashboardAuthAttemptRows<T extends { clientKey?: string | null }>(rows: T[]): T[] {
  return rows.map((row) => ({
    ...row,
    clientKey: row.clientKey?.startsWith("account:")
      ? "account:[redacted]"
      : "[redacted:client]",
  }));
}

function capRows<T>(rows: T[], limit: number): { rows: T[]; truncated: boolean } {
  return { rows: rows.slice(0, limit), truncated: rows.length > limit };
}
