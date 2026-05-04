import { redirect } from "next/navigation";
import { getDb, setFeatureRequestStatus } from "@nitsyclaw/shared/db";
import { requireSameOrigin } from "../../../../lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const VALID_STATUSES = new Set(["pending", "in_progress", "done", "rejected"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

function cleanText(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text ? text.slice(0, 1000) : undefined;
}

export async function POST(request: Request): Promise<never | Response> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response("Bad request", { status: 400, headers: NO_STORE });
  }
  const id = cleanText(form.get("id"));
  const status = cleanText(form.get("status"));
  const expectedStatus = cleanText(form.get("expectedStatus"));
  const note = cleanText(form.get("note"));

  if (!id || !UUID_PATTERN.test(id)) {
    return new Response("Invalid queue item id", { status: 400, headers: NO_STORE });
  }
  if (!status || !VALID_STATUSES.has(status)) {
    return new Response("Invalid queue status", { status: 400, headers: NO_STORE });
  }
  if (!expectedStatus || !VALID_STATUSES.has(expectedStatus)) {
    return new Response("Invalid expected queue status", { status: 400, headers: NO_STORE });
  }

  const completedAt = status === "done" || status === "rejected" ? new Date() : undefined;
  const updated = await setFeatureRequestStatus(getDb(), id, {
    status: status as "pending" | "in_progress" | "done" | "rejected",
    expectedStatus: expectedStatus as "pending" | "in_progress" | "done" | "rejected",
    implementationNotes: status === "done" ? note : undefined,
    rejectionReason: status === "rejected" ? note : undefined,
    completedAt,
  });
  if (!updated) {
    return new Response("Queue item not found", { status: 404, headers: NO_STORE });
  }

  redirect("/queue");
}
