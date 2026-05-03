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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeleteScope = "memories" | "conversations" | "everything";

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
  const form = await req.formData();
  const scope = parseScope(form.get("scope"));
  const confirm = String(form.get("confirm") ?? "").trim();

  if (!scope) {
    return NextResponse.json({ error: "Unknown delete scope" }, { status: 400 });
  }

  const required = confirmationsByScope[scope];
  if (confirm !== required) {
    return NextResponse.json(
      { error: `Type ${required} to confirm.` },
      { status: 400 },
    );
  }

  const db = getDb();
  if (scope === "memories") {
    await db.delete(memories);
  } else if (scope === "conversations") {
    await db.delete(messages);
  } else {
    await Promise.all([
      db.delete(auditLog),
      db.delete(briefs),
      db.delete(confirmations),
      db.delete(expenses),
      db.delete(featureRequests),
      db.delete(memories),
      db.delete(messages),
      db.delete(profileContext),
      db.delete(reminders),
      db.delete(connectedAccounts),
      db.delete(systemHeartbeats),
    ]);
  }

  return NextResponse.json({
    ok: true,
    scope,
    deletedAt: new Date().toISOString(),
  });
}
