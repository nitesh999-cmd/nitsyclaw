export const DASHBOARD_SESSION_COOKIE = "nitsyclaw_dashboard_session";

const SESSION_TTL_MS = 12 * 60 * 60_000;

interface DashboardSessionPayload {
  sub: string;
  iat: number;
  exp: number;
}

export async function createDashboardSessionToken(
  user: string,
  secret: string,
  nowMs = Date.now(),
): Promise<string> {
  const payload: DashboardSessionPayload = {
    sub: user,
    iat: nowMs,
    exp: nowMs + SESSION_TTL_MS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export async function verifyDashboardSessionToken(
  token: string | undefined,
  secret: string,
  expectedUser: string,
  nowMs = Date.now(),
): Promise<boolean> {
  if (!token || !secret) return false;

  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra !== undefined) return false;

  const expectedSignature = await sign(encodedPayload, secret);
  if (!constantTimeEqual(signature, expectedSignature)) return false;

  let payload: DashboardSessionPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload)) as DashboardSessionPayload;
  } catch {
    return false;
  }

  return payload.sub === expectedUser && Number.isFinite(payload.exp) && payload.exp > nowMs;
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

function constantTimeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function base64UrlEncode(value: string): string {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
