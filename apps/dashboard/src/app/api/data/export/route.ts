import { NextResponse } from "next/server";
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
import { desc } from "drizzle-orm";
import {
  redactAuditExportRows,
  redactConnectedAccountExportRows,
} from "../../../../lib/data-export-redaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const db = getDb();
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
    ] = await Promise.all([
      db.select().from(messages).orderBy(desc(messages.createdAt)).limit(5000),
      db.select().from(memories).orderBy(desc(memories.createdAt)).limit(5000),
      db.select().from(reminders).orderBy(desc(reminders.createdAt)).limit(5000),
      db.select().from(expenses).orderBy(desc(expenses.createdAt)).limit(5000),
      db.select().from(briefs).orderBy(desc(briefs.createdAt)).limit(2000),
      db.select().from(confirmations).orderBy(desc(confirmations.createdAt)).limit(5000),
      db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(5000),
      db.select().from(featureRequests).orderBy(desc(featureRequests.createdAt)).limit(5000),
      db.select().from(profileContext).orderBy(desc(profileContext.updatedAt)).limit(5000),
      db.select().from(connectedAccounts).orderBy(desc(connectedAccounts.updatedAt)).limit(5000),
      db.select().from(systemHeartbeats),
    ]);

    return NextResponse.json(
      {
        exportedAt: new Date().toISOString(),
        format: "nitsyclaw-data-export-v1",
        limits: { perTable: 5000 },
        data: {
          messages: messageRows,
          memories: memoryRows,
          reminders: reminderRows,
          expenses: expenseRows,
          briefs: briefRows,
          confirmations: confirmationRows,
          auditLog: redactAuditExportRows(auditRows),
          featureRequests: featureRows,
          profileContext: profileRows,
          connectedAccounts: redactConnectedAccountExportRows(accountRows),
          systemHeartbeats: heartbeatRows,
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
