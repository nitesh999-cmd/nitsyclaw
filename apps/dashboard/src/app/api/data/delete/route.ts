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
import { eq } from "drizzle-orm";
import { requireSameOrigin } from "../../../../lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

type DeleteScope = "memories" | "conversations" | "everything";
type DeleteCounts = Record<string, number>;

const confirmationsByScope: Record<DeleteScope, string> = {
  memories: "DELETE MEMORIES",
  conversations: "DELETE CONVERSATIONS",
  everything: "DELETE EVERYTHING",
};

function parseScope(value: FormDataEntryValue | null): DeleteScope | null {
  return value === "memories" || value === "conversations" || value === "everything"
    ? value
    : null;
}

export async function POST(req: Request) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    console.error("[data/delete] invalid form body", e);
    return NextResponse.json(
      { error: "Invalid delete request." },
      { status: 400, headers: NO_STORE },
    );
  }

  const scope = parseScope(form.get("scope"));
  const confirm = String(form.get("confirm") ?? "").trim();
  const currentPassword = String(form.get("currentPassword") ?? "");
  const exportSnapshotId = String(form.get("exportSnapshotId") ?? "").trim();

  if (!scope) {
    return redirectToSettings(req, { deleteError: "unknown-scope" });
  }

  const required = confirmationsByScope[scope];
  if (confirm !== required) {
    return redirectToSettings(req, { deleteError: "confirm", scope });
  }

  if (scope === "everything") {
    if (!constantTimeEqual(currentPassword, process.env.NITSYCLAW_DASHBOARD_PASSWORD ?? "")) {
      return redirectToSettings(req, { deleteError: "reauth", scope });
    }
    if (!isRecentExportSnapshotId(exportSnapshotId)) {
      return redirectToSettings(req, { deleteError: "export", scope });
    }
  }

  try {
    const db = getDb();
    const started = Date.now();
    const counts = await db.transaction(async (tx) => {
      const deleted: DeleteCounts = {};

      if (scope === "memories") {
        deleted.memories = (await tx.delete(memories).returning({ id: memories.id })).length;
      } else if (scope === "conversations") {
        deleted.messages = (await tx.delete(messages).returning({ id: messages.id })).length;
      } else {
        deleted.confirmations = (await tx.delete(confirmations).returning({ id: confirmations.id })).length;
        deleted.expenses = (await tx.delete(expenses).returning({ id: expenses.id })).length;
        deleted.featureRequests = (await tx.delete(featureRequests).returning({ id: featureRequests.id })).length;
        deleted.memories = (await tx.delete(memories).returning({ id: memories.id })).length;
        deleted.messages = (await tx.delete(messages).returning({ id: messages.id })).length;
        deleted.profileContext = (await tx.delete(profileContext).returning({ id: profileContext.id })).length;
        deleted.reminders = (await tx.delete(reminders).returning({ id: reminders.id })).length;
        deleted.connectedAccounts = (await tx.delete(connectedAccounts).returning({ id: connectedAccounts.id })).length;
        deleted.systemHeartbeats = (await tx.delete(systemHeartbeats).returning({ source: systemHeartbeats.source })).length;
        deleted.briefs = (await tx.delete(briefs).returning({ id: briefs.id })).length;
        deleted.auditLog = (await tx.delete(auditLog).where(eq(auditLog.tool, "data_delete")).returning({ id: auditLog.id })).length;
      }

      await tx.insert(auditLog).values({
        actor: "user",
        tool: "data_delete",
        input: { scope, exportSnapshotId: scope === "everything" ? exportSnapshotId : undefined },
        output: { deleted },
        success: true,
        durationMs: Date.now() - started,
      });

      return deleted;
    });
    console.info("[data/delete] completed", { scope, counts });
  } catch (e) {
    console.error("[data/delete] failed", e);
    return NextResponse.json(
      { error: "Data deletion failed. Check server logs." },
      { status: 500, headers: NO_STORE },
    );
  }

  return redirectToSettings(req, { deleted: scope });
}

function redirectToSettings(req: Request, params: Record<string, string>): NextResponse {
  const url = new URL("/settings", req.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function isRecentExportSnapshotId(value: string): boolean {
  const match = value.match(/^export_(\d{14})$/);
  if (!match) return false;
  const stamp = match[1]!;
  const year = Number(stamp.slice(0, 4));
  const month = Number(stamp.slice(4, 6));
  const day = Number(stamp.slice(6, 8));
  const hour = Number(stamp.slice(8, 10));
  const minute = Number(stamp.slice(10, 12));
  const second = Number(stamp.slice(12, 14));
  const exportedAtMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const ageMs = Date.now() - exportedAtMs;
  return Number.isFinite(exportedAtMs) && ageMs >= 0 && ageMs <= 24 * 60 * 60_000;
}

function constantTimeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
