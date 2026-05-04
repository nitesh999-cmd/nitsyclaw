import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("dashboard login route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects malformed form bodies without exposing a 500", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NITSYCLAW_DASHBOARD_PASSWORD", "secret");
    vi.stubEnv("NITSYCLAW_DASHBOARD_USER", "nitesh");

    const response = await POST(new Request("https://nitsyclaw.vercel.app/api/auth/login", {
      method: "POST",
      headers: {
        origin: "https://nitsyclaw.vercel.app",
        "content-type": "multipart/form-data; boundary=x",
      },
      body: "not multipart",
    }));

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Bad request");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("keeps global lockout above the per-client threshold", () => {
    const source = readFileSync("apps/dashboard/src/app/api/auth/login/route.ts", "utf8");

    expect(source).toContain("GLOBAL_LOGIN_MAX_FAILURES = 50");
    expect(source).toContain("recordDashboardLoginFailure(GLOBAL_LOGIN_FAILURE_KEY, now, GLOBAL_LOGIN_MAX_FAILURES)");
  });
});
