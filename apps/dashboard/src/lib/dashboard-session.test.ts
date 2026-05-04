import { describe, expect, it } from "vitest";
import { createDashboardSessionToken, verifyDashboardSessionToken } from "./dashboard-session";

describe("dashboard session tokens", () => {
  it("verifies a fresh token for the expected user", async () => {
    const token = await createDashboardSessionToken("nitesh", "secret", 1_000);

    await expect(verifyDashboardSessionToken(token, "secret", "nitesh", 2_000)).resolves.toBe(true);
  });

  it("rejects tampered tokens", async () => {
    const token = await createDashboardSessionToken("nitesh", "secret", 1_000);
    const [payload, signature] = token.split(".");
    const tampered = `${payload?.slice(0, -1)}x.${signature}`;

    await expect(verifyDashboardSessionToken(tampered, "secret", "nitesh", 2_000)).resolves.toBe(false);
  });

  it("rejects expired tokens", async () => {
    const token = await createDashboardSessionToken("nitesh", "secret", 1_000);

    await expect(verifyDashboardSessionToken(token, "secret", "nitesh", 13 * 60 * 60_000)).resolves.toBe(false);
  });

  it("rejects tokens after password rotation", async () => {
    const token = await createDashboardSessionToken("nitesh", "old-secret", 1_000);

    await expect(verifyDashboardSessionToken(token, "new-secret", "nitesh", 2_000)).resolves.toBe(false);
  });
});
