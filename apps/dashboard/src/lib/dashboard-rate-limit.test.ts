import { beforeEach, describe, expect, it } from "vitest";
import {
  checkDashboardRateLimit,
  dashboardRateLimitHeaders,
  resetDashboardRateLimitForTests,
} from "./dashboard-rate-limit";

describe("dashboard API rate limit", () => {
  beforeEach(() => {
    resetDashboardRateLimitForTests();
  });

  it("allows requests under the limit and blocks the next request in the same window", () => {
    const request = new Request("https://nitsyclaw.vercel.app/api/chat", {
      headers: {
        "x-forwarded-for": "203.0.113.10",
      },
    });

    expect(checkDashboardRateLimit(request, { scope: "chat", limit: 2, windowMs: 60_000, nowMs: 1_000 }).allowed).toBe(true);
    expect(checkDashboardRateLimit(request, { scope: "chat", limit: 2, windowMs: 60_000, nowMs: 2_000 }).allowed).toBe(true);
    const blocked = checkDashboardRateLimit(request, { scope: "chat", limit: 2, windowMs: 60_000, nowMs: 3_000 });

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(dashboardRateLimitHeaders(blocked)["Retry-After"]).toBe(String(blocked.retryAfterSec));
  });

  it("keys by dashboard session cookie before IP", () => {
    const first = new Request("https://nitsyclaw.vercel.app/api/chat", {
      headers: {
        cookie: "nitsyclaw_dashboard_session=session-a",
        "x-forwarded-for": "203.0.113.10",
      },
    });
    const second = new Request("https://nitsyclaw.vercel.app/api/chat", {
      headers: {
        cookie: "nitsyclaw_dashboard_session=session-b",
        "x-forwarded-for": "203.0.113.10",
      },
    });

    expect(checkDashboardRateLimit(first, { scope: "chat", limit: 1, windowMs: 60_000, nowMs: 1_000 }).allowed).toBe(true);
    expect(checkDashboardRateLimit(second, { scope: "chat", limit: 1, windowMs: 60_000, nowMs: 2_000 }).allowed).toBe(true);
    expect(checkDashboardRateLimit(first, { scope: "chat", limit: 1, windowMs: 60_000, nowMs: 3_000 }).allowed).toBe(false);
  });
});
