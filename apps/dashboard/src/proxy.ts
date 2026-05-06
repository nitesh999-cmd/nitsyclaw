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
  return (
    pathname === "/api/healthz" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/manifest.json" ||
    pathname === "/icon.svg"
  );
}

function isAuthPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/api/auth/login" || pathname === "/api/auth/logout";
}

function isSaleReadinessPath(pathname: string): boolean {
  return pathname === "/api/sale-readiness";
}

function withSecurityHeaders(response: NextResponse, request: NextRequest): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Frame-Options", "DENY"); // nosemgrep: javascript.express.security.x-frame-options-misconfiguration.x-frame-options-misconfiguration - static DENY value, not user-controlled.
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  const microphonePolicy = request.nextUrl.pathname === "/chat" ? "microphone=(self)" : "microphone=()";
  response.headers.set("Permissions-Policy", `camera=(), ${microphonePolicy}, geolocation=()`);
  response.headers.set("Content-Security-Policy", [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "connect-src 'self' https://*.vercel-insights.com https://*.vercel-scripts.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; "));
  return response;
}

export async function proxy(request: NextRequest) {
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
    // Explicit dev bypass: must set NITSYCLAW_DEV_AUTH_BYPASS=1 — prevents accidental open deployments
    const devBypass = process.env.VERCEL_ENV !== "production" && process.env.NITSYCLAW_DEV_AUTH_BYPASS === "1";
    if (!devBypass) return notConfigured(request);
    console.warn("[SECURITY] Dashboard auth bypass active – set NITSYCLAW_DASHBOARD_PASSWORD before deploying");
    return withSecurityHeaders(NextResponse.next(), request);
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
