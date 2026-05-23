import { NextResponse } from "next/server";
import { deleteMemory, getDb, memories, updateMemory } from "@nitsyclaw/shared/db";
import { mergeMemoryQualityTags } from "@nitsyclaw/shared/agent";
import { eq } from "drizzle-orm";
import { logDashboardError } from "../../../../lib/dashboard-runtime";
import { blockPublicSaleCustomerDataAccess } from "../../../../lib/public-sale-data-guard";
import { requireSameOrigin } from "../../../../lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

type MemoryReviewAction = "pin" | "downgrade" | "edit" | "expire" | "delete";

function parseAction(value: FormDataEntryValue | null): MemoryReviewAction | null {
  return value === "pin" || value === "downgrade" || value === "edit" || value === "expire" || value === "delete"
    ? value
    : null;
}

function redirectToMemory(req: Request, params: Record<string, string>): NextResponse {
  const url = new URL("/memory", req.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function cleanContent(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim().slice(0, 4000);
}

function reviewedTags(content: string, tags: string[], extra: string[]): string[] {
  const base = mergeMemoryQualityTags(content, tags.filter((tag) => !["review:needed"].includes(tag)));
  return Array.from(new Set([...base, "reviewed", ...extra]));
}

export async function POST(req: Request) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;

  const saleModeBlock = blockPublicSaleCustomerDataAccess();
  if (saleModeBlock) return saleModeBlock;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid memory review request." }, { status: 400, headers: NO_STORE });
  }

  const id = String(form.get("id") ?? "").trim();
  const action = parseAction(form.get("action"));
  if (!id || !action) return redirectToMemory(req, { reviewError: "invalid" });

  try {
    const db = getDb();
    const [current] = await db.select().from(memories).where(eq(memories.id, id)).limit(1);
    if (!current) return redirectToMemory(req, { reviewError: "missing" });

    if (action === "delete" || action === "expire") {
      await deleteMemory(db, id);
      return redirectToMemory(req, { reviewed: action });
    }

    if (action === "pin") {
      await updateMemory(db, id, {
        kind: "pin",
        tags: reviewedTags(current.content, current.tags, ["pinned"]),
      });
      return redirectToMemory(req, { reviewed: "pin" });
    }

    if (action === "downgrade") {
      await updateMemory(db, id, {
        kind: "note",
        tags: reviewedTags(current.content, current.tags, ["downgraded"]),
      });
      return redirectToMemory(req, { reviewed: "downgrade" });
    }

    const content = cleanContent(form.get("content"));
    if (content.length < 1) return redirectToMemory(req, { reviewError: "empty" });
    await updateMemory(db, id, {
      content,
      tags: reviewedTags(content, current.tags, ["edited"]),
    });
    return redirectToMemory(req, { reviewed: "edit" });
  } catch (error) {
    logDashboardError("memory.review", error);
    return NextResponse.json({ error: "Memory review failed. Try again shortly." }, { status: 500, headers: NO_STORE });
  }
}
