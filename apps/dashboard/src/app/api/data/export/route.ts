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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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
        auditLog: auditRows,
        featureRequests: featureRows,
        profileContext: profileRows,
        connectedAccounts: accountRows.map((row) => ({
          ...row,
          accessToken: "[redacted]",
          refreshToken: row.refreshToken ? "[redacted]" : null,
        })),
        systemHeartbeats: heartbeatRows,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": 'attachment; filename="nitsyclaw-data-export.json"',
      },
    },
  );
}
