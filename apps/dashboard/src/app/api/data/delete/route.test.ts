import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createDashboardSessionToken, DASHBOARD_SESSION_COOKIE } from "../../../../lib/dashboard-session";

describe("data delete route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails safely when delete-everything export proof cannot be verified", async () => {
    vi.stubEnv("NITSYCLAW_DASHBOARD_PASSWORD", "test-password");
    vi.stubEnv("ENCRYPTION_KEY", "");

    const form = new FormData();
    form.set("scope", "everything");
    form.set("confirm", "DELETE EVERYTHING");
    form.set("currentPassword", "test-password");
    form.set("exportSnapshotId", "export_20260508160000");
    form.set("exportProof", "payload.signature");

    // Dashboard auth is configured (password stubbed above), so a valid
    // session cookie is required to reach the route body under test.
    const sessionToken = await createDashboardSessionToken("nitesh", "test-password");

    const response = await POST(new Request("https://nitsyclaw.vercel.app/api/data/delete", {
      method: "POST",
      headers: {
        origin: "https://nitsyclaw.vercel.app",
        cookie: `${DASHBOARD_SESSION_COOKIE}=${sessionToken}`,
      },
      body: form,
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("deleteError=export");
  });

  it("requires configured dashboard auth before delete-everything can reauthenticate", async () => {
    vi.stubEnv("NITSYCLAW_DASHBOARD_PASSWORD", "");
    vi.stubEnv("ENCRYPTION_KEY", "test-secret");

    const form = new FormData();
    form.set("scope", "everything");
    form.set("confirm", "DELETE EVERYTHING");
    form.set("currentPassword", "");
    form.set("exportSnapshotId", "export_20260508160000");
    form.set("exportProof", "payload.signature");

    const response = await POST(new Request("https://nitsyclaw.vercel.app/api/data/delete", {
      method: "POST",
      headers: { origin: "https://nitsyclaw.vercel.app" },
      body: form,
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("deleteError=reauth");
  });
});
