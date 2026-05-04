import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isDashboardAuthConfigured } from "./lib/dashboard-auth";
import { DASHBOARD_SESSION_COOKIE, verifyDashboardSessionToken } from "./lib/dashboard-session";

function unauthorized(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = new URLSearchParams({ next: request.nextUrl.pathname }).toString();
    return withSecurityHeaders(NextResponse.redirect(url));
  }

  return withSecurityHeaders(new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "Cache-Control": "no-store",
    },
  }));
}

function notConfigured() {
  return withSecurityHeaders(new NextResponse("Dashboard auth is not configured", {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
    },
  }));
}

function isAuthPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/api/auth/login" || pathname === "/api/auth/logout";
}

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  return response;
}

export async function middleware(request: NextRequest) {
  const dashboardPassword = process.env.NITSYCLAW_DASHBOARD_PASSWORD;
  const dashboardUser = process.env.NITSYCLAW_DASHBOARD_USER || "nitesh";
  const configured = isDashboardAuthConfigured({
    nodeEnv: process.env.NODE_ENV,
    dashboardPassword,
  });

  if (!configured) {
    return process.env.NODE_ENV === "production" ? notConfigured() : withSecurityHeaders(NextResponse.next());
  }

  if (isAuthPath(request.nextUrl.pathname)) return withSecurityHeaders(NextResponse.next());

  const session = request.cookies.get(DASHBOARD_SESSION_COOKIE)?.value;
  if (await verifyDashboardSessionToken(session, dashboardPassword ?? "", dashboardUser)) {
    return withSecurityHeaders(NextResponse.next());
  }

  return unauthorized(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
