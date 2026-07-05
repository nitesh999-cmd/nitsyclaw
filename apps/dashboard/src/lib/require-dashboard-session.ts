// Real per-request session gate for the dashboard.
//
// WHY THIS FILE EXISTS: `verifyDashboardSessionToken` (dashboard-session.ts)
// was previously only called from the login route (to create a token) and
// the logout route — no API route ever verified the cookie it set. Every
// data-bearing route relied solely on `requireSameOrigin`, which is a CSRF
// check (does the Origin/Referer header match this site?) — it says nothing
// about whether the caller is logged in. Any visitor who loads the public
// /login page and runs `fetch('/api/search?q=x')` from the browser console
// passed the same-origin check with zero credentials. This guard closes
// that gap by actually verifying the session cookie's HMAC signature and
// expiry against NITSYCLAW_DASHBOARD_PASSWORD before letting a route run.

import { NextResponse } from "next/server";
import { isDashboardAuthConfigured } from "./dashboard-auth";
import { verifyDashboardSessionToken, DASHBOARD_SESSION_COOKIE } from "./dashboard-session";

const NO_STORE = { "Cache-Control": "no-store" };

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) return trimmed.slice(name.length + 1);
  }
  return undefined;
}

/**
 * Verify the dashboard session cookie. Returns a 401 Response to short-circuit
 * the caller if the session is missing/invalid/expired; returns null if the
 * request may proceed.
 *
 * If NITSYCLAW_DASHBOARD_PASSWORD is unset, dashboard auth is only considered
 * "not configured" in non-production environments (matches the existing
 * isDashboardAuthConfigured convention) — local dev without a password set
 * still works, but production always requires a valid session.
 */
export async function requireDashboardSession(request: Request): Promise<Response | null> {
  const dashboardPassword = process.env.NITSYCLAW_DASHBOARD_PASSWORD;
  const expectedUser = process.env.NITSYCLAW_DASHBOARD_USER || "nitesh";
  const configured = isDashboardAuthConfigured({
    nodeEnv: process.env.NODE_ENV,
    dashboardPassword,
  });

  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Dashboard auth is not configured." },
        { status: 503, headers: NO_STORE },
      );
    }
    return null;
  }

  const token = readCookie(request, DASHBOARD_SESSION_COOKIE);
  const valid = await verifyDashboardSessionToken(token, dashboardPassword ?? "", expectedUser);
  if (!valid) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401, headers: NO_STORE });
  }
  return null;
}
