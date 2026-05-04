import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { DASHBOARD_SESSION_COOKIE } from "./dashboard-session";

const EXPORT_PROOF_TTL_MS = 24 * 60 * 60_000;

export interface ExportProofPayload {
  snapshotId: string;
  exportedAt: string;
  complete: boolean;
  counts: Record<string, number>;
  sessionHash: string;
}

export function sessionTokenFromRequest(req: Request): string {
  const cookie = req.headers.get("cookie") ?? "";
  const prefix = `${DASHBOARD_SESSION_COOKIE}=`;
  const part = cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(prefix));
  return part ? decodeURIComponent(part.slice(prefix.length)) : "";
}

export function createExportProof(payload: ExportProofPayload, secret = exportProofSecret()): string {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encoded, secret);
  return `${encoded}.${signature}`;
}

export function verifyExportProof(args: {
  proof: string;
  snapshotId: string;
  sessionToken: string;
  nowMs?: number;
  secret?: string;
}): ExportProofPayload | null {
  const [encoded, signature, extra] = args.proof.split(".");
  if (!encoded || !signature || extra !== undefined) return null;
  const expected = sign(encoded, args.secret ?? exportProofSecret());
  if (!safeEqual(signature, expected)) return null;

  let payload: ExportProofPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encoded)) as ExportProofPayload;
  } catch {
    return null;
  }

  if (payload.snapshotId !== args.snapshotId) return null;
  if (!payload.complete) return null;
  if (payload.sessionHash !== hashSession(args.sessionToken)) return null;
  const exportedAtMs = Date.parse(payload.exportedAt);
  if (!Number.isFinite(exportedAtMs)) return null;
  const ageMs = (args.nowMs ?? Date.now()) - exportedAtMs;
  if (ageMs < 0 || ageMs > EXPORT_PROOF_TTL_MS) return null;
  return payload;
}

export function hashSession(sessionToken: string): string {
  return createHash("sha256").update(sessionToken).digest("base64url");
}

function exportProofSecret(): string {
  const secret = process.env.ENCRYPTION_KEY || process.env.NITSYCLAW_DASHBOARD_PASSWORD;
  if (!secret) throw new Error("Export proof signing secret is not configured");
  return secret;
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}
