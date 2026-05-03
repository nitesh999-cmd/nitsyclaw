import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkDashboardAuth } from "./lib/dashboard-auth";

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="NitsyClaw Dashboard", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

function locked() {
  return new NextResponse("Too many authentication attempts", {
    status: 429,
    headers: {
      "Cache-Control": "no-store",
      "Retry-After": "900",
    },
  });
}

function notConfigured() {
  return new NextResponse("Dashboard auth is not configured", {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function clientKey(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("user-agent") ||
    "unknown"
  );
}

export function middleware(request: NextRequest) {
  const result = checkDashboardAuth(request.headers.get("authorization"), {
    nodeEnv: process.env.NODE_ENV,
    dashboardUser: process.env.NITSYCLAW_DASHBOARD_USER,
    dashboardPassword: process.env.NITSYCLAW_DASHBOARD_PASSWORD,
  }, {
    clientKey: clientKey(request),
  });

  if (result.ok) return NextResponse.next();
  if (result.reason === "not-configured") return notConfigured();
  if (result.reason === "locked") return locked();
  return unauthorized();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
