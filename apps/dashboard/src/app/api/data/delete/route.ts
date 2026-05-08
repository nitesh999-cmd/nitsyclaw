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
import { disconnectSpotify } from "@nitsyclaw/shared/integrations/spotify";
import { sessionTokenFromRequest, verifyExportProof } from "../../../../lib/data-export-proof";
import { getOwnerIdentity, logDashboardError } from "../../../../lib/dashboard-runtime";
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
  } catch {
    logDashboardError("data.delete.invalid_form", new Error("invalid form body"));
    return NextResponse.json(
      { error: "Invalid delete request." },
      { status: 400, headers: NO_STORE },
    );
  }

  const scope = parseScope(form.get("scope"));
  const confirm = String(form.get("confirm") ?? "").trim();
  const currentPassword = String(form.get("currentPassword") ?? "");
  const exportSnapshotId = String(form.get("exportSnapshotId") ?? "").trim();
  const exportProof = String(form.get("exportProof") ?? "").trim();

  if (!scope) {
    return redirectToSettings(req, { deleteError: "unknown-scope" });
  }

  const required = confirmationsByScope[scope];
  if (confirm !== required) {
    return redirectToSettings(req, { deleteError: "confirm", scope });
  }

  if (scope === "everything") {
    const expectedPassword = process.env.NITSYCLAW_DASHBOARD_PASSWORD ?? "";
    if (!expectedPassword || !constantTimeEqual(currentPassword, expectedPassword)) {
      return redirectToSettings(req, { deleteError: "reauth", scope });
    }
    let verifiedExportProof = false;
    try {
      verifiedExportProof = Boolean(verifyExportProof({
        proof: exportProof,
        snapshotId: exportSnapshotId,
        sessionToken: sessionTokenFromRequest(req),
      }));
    } catch (e) {
      logDashboardError("data.delete.export_proof", e);
    }
    if (!verifiedExportProof) {
      return redirectToSettings(req, { deleteError: "export", scope });
    }
  }

  try {
    const db = getDb();
    if (scope === "everything") {
      const { ownerHash } = getOwnerIdentity();
      const spotifyDisconnect = await disconnectSpotify(db, ownerHash);
      if (spotifyDisconnect.revokeError) {
        return redirectToSettings(req, { deleteError: "provider-revoke", scope });
      }
    }
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
        deleted.dashboardAuthAttempts = (await tx.delete(dashboardAuthAttempts).returning({ clientKey: dashboardAuthAttempts.clientKey })).length;
        deleted.auditLog = (await tx.delete(auditLog).returning({ id: auditLog.id })).length;
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
    logDashboardError("data.delete", e);
    return NextResponse.json(
      { error: "Data deletion failed. Try again shortly." },
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

function constantTimeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
