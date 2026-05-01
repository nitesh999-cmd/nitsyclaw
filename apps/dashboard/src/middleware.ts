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

function notConfigured() {
  return new NextResponse("Dashboard auth is not configured", {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export function middleware(request: NextRequest) {
  const result = checkDashboardAuth(request.headers.get("authorization"), {
    nodeEnv: process.env.NODE_ENV,
    dashboardUser: process.env.NITSYCLAW_DASHBOARD_USER,
    dashboardPassword: process.env.NITSYCLAW_DASHBOARD_PASSWORD,
  });

  if (result.ok) return NextResponse.next();
  if (result.reason === "not-configured") return notConfigured();
  return unauthorized();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
