import { afterEach, describe, expect, it, vi } from "vitest";

describe("dashboard login route timeout handling", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../../../../lib/dashboard-login-attempts");
    vi.unstubAllEnvs();
  });

  it("fails closed when attempt storage hangs", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NITSYCLAW_DASHBOARD_PASSWORD", "secret");
    vi.stubEnv("NITSYCLAW_DASHBOARD_USER", "nitesh");
    vi.stubEnv("NITSYCLAW_AUTH_ATTEMPT_TIMEOUT_MS", "1");
    vi.doMock("../../../../lib/dashboard-login-attempts", () => ({
      clearDashboardLoginAttemptsForKeys: vi.fn(() => new Promise(() => {})),
      getDashboardLoginAttemptStates: vi.fn(() => new Promise(() => {})),
      recordDashboardLoginFailure: vi.fn(() => new Promise(() => {})),
    }));

    const { POST } = await import("./route");
    const started = Date.now();
    const response = await POST(new Request("https://nitsyclaw.vercel.app/api/auth/login", {
      method: "POST",
      headers: {
        origin: "https://nitsyclaw.vercel.app",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        user: "nitesh",
        password: "secret",
        next: "/",
      }),
    }));

    expect(Date.now() - started).toBeLessThan(500);
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Login protection is temporarily unavailable. Please try again shortly.");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
