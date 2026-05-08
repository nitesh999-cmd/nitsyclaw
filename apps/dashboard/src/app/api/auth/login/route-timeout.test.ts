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
        password: "wrong",
        next: "/",
      }),
    }));

    expect(Date.now() - started).toBeLessThan(500);
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Login protection is temporarily unavailable. Please try again shortly.");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not make a valid owner login wait for attempt storage", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NITSYCLAW_DASHBOARD_PASSWORD", "secret");
    vi.stubEnv("NITSYCLAW_DASHBOARD_USER", "nitesh");
    vi.stubEnv("NITSYCLAW_AUTH_ATTEMPT_TIMEOUT_MS", "1");
    const getStates = vi.fn(() => new Promise(() => {}));
    vi.doMock("../../../../lib/dashboard-login-attempts", () => ({
      clearDashboardLoginAttemptsForKeys: vi.fn(() => new Promise(() => {})),
      getDashboardLoginAttemptStates: getStates,
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
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://nitsyclaw.vercel.app/");
    expect(response.headers.get("set-cookie")).toContain("nitsyclaw_dashboard_session=");
    expect(getStates).not.toHaveBeenCalled();
  });

  it("redacts attempt storage errors before logging", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NITSYCLAW_DASHBOARD_PASSWORD", "secret");
    vi.stubEnv("NITSYCLAW_DASHBOARD_USER", "nitesh");
    vi.doMock("../../../../lib/dashboard-login-attempts", () => ({
      clearDashboardLoginAttemptsForKeys: vi.fn(),
      getDashboardLoginAttemptStates: vi.fn(() =>
        Promise.reject(new Error("DB failed for nitesh@example.com +61 430 008 008 sk_live_12345678901234567890")),
      ),
      recordDashboardLoginFailure: vi.fn(),
    }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const { POST } = await import("./route");
    const response = await POST(new Request("https://nitsyclaw.vercel.app/api/auth/login", {
      method: "POST",
      headers: {
        origin: "https://nitsyclaw.vercel.app",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        user: "nitesh",
        password: "wrong",
        next: "/",
      }),
    }));

    expect(response.status).toBe(503);
    expect(consoleError).toHaveBeenCalledWith(
      "[dashboard] operation failed",
      expect.objectContaining({
        scope: "auth.load login attempt state",
        error: expect.objectContaining({
          message: expect.stringContaining("[redacted:email]"),
        }),
      }),
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("nitesh@example.com");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("+61 430 008 008");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("sk_live");
  });
});
