import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isDashboardAuthConfigured } from "./lib/dashboard-auth";
import { DASHBOARD_SESSION_COOKIE, verifyDashboardSessionToken } from "./lib/dashboard-session";
import { evaluateSaleReadiness } from "./lib/sale-readiness";

function unauthorized(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = new URLSearchParams({ next: request.nextUrl.pathname }).toString();
    return withSecurityHeaders(NextResponse.redirect(url), request);
  }

  return withSecurityHeaders(new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "Cache-Control": "no-store",
    },
  }), request);
}

function notConfigured(request: NextRequest) {
  return withSecurityHeaders(new NextResponse("Dashboard auth is not configured", {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
    },
  }), request);
}

function publicSaleNotReady(request: NextRequest) {
  return withSecurityHeaders(new NextResponse("Public sale mode is not ready", {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
    },
  }), request);
}

function isPublicPath(pathname: string): boolean {
  return pathname === "/api/healthz" || pathname === "/privacy" || pathname === "/terms";
}

function isAuthPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/api/auth/login" || pathname === "/api/auth/logout";
}

function isSaleReadinessPath(pathname: string): boolean {
  return pathname === "/api/sale-readiness";
}

function withSecurityHeaders(response: NextResponse, request: NextRequest): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  const microphonePolicy = request.nextUrl.pathname === "/chat" ? "microphone=(self)" : "microphone=()";
  response.headers.set("Permissions-Policy", `camera=(), ${microphonePolicy}, geolocation=()`);
  response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  return response;
}

export async function middleware(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) {
    return withSecurityHeaders(NextResponse.next(), request);
  }

  const dashboardPassword = process.env.NITSYCLAW_DASHBOARD_PASSWORD;
  const dashboardUser = process.env.NITSYCLAW_DASHBOARD_USER || "nitesh";
  const configured = isDashboardAuthConfigured({
    nodeEnv: process.env.NODE_ENV,
    dashboardPassword,
  });

  if (!configured) {
    return process.env.NODE_ENV === "production" ? notConfigured(request) : withSecurityHeaders(NextResponse.next(), request);
  }

  if (isAuthPath(request.nextUrl.pathname)) {
    return withSecurityHeaders(NextResponse.next(), request);
  }

  const session = request.cookies.get(DASHBOARD_SESSION_COOKIE)?.value;
  if (await verifyDashboardSessionToken(session, dashboardPassword ?? "", dashboardUser)) {
    if (isSaleReadinessPath(request.nextUrl.pathname)) {
      return withSecurityHeaders(NextResponse.next(), request);
    }

    const saleReadiness = evaluateSaleReadiness();
    if (saleReadiness.mode === "public-sale" && !saleReadiness.ready) {
      return publicSaleNotReady(request);
    }

    return withSecurityHeaders(NextResponse.next(), request);
  }

  return unauthorized(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
