import { describe, expect, it } from "vitest";
import { evaluateSaleReadiness } from "./sale-readiness";

describe("sale readiness gate", () => {
  it("fails closed by default for public sale", () => {
    const result = evaluateSaleReadiness({});

    expect(result.ready).toBe(false);
    expect(result.mode).toBe("private-owner");
    expect(result.blockers).toContain("multi-user auth is not verified");
    expect(result.blockers).toContain("tenant isolation is not verified");
    expect(result.blockers).toContain("provider-side delete/revoke is not verified");
    expect(result.privateUseScore).toBe(0);
    expect(result.publicSaleScore).toBe(0);
    expect(result.privateUseBlockers).toContain("owner dashboard password is missing or too weak");
    expect(result.nextActions).toContain("Set a strong NITSYCLAW_DASHBOARD_PASSWORD in production.");
  });

  it("does not report public-sale ready from env flags alone", () => {
    const result = evaluateSaleReadiness({
      NITSYCLAW_PUBLIC_SALE_MODE: "1",
      NITSYCLAW_AUTH_MODEL: "multi-user",
      NITSYCLAW_TENANT_ISOLATION: "verified",
      NITSYCLAW_PROVIDER_DELETE: "verified",
      NITSYCLAW_LEGAL_COPY: "verified",
    });

    expect(result.ready).toBe(false);
    expect(result.mode).toBe("public-sale");
    expect(result.blockers).toContain("code-level tenant isolation is not implemented");
    expect(result.blockers).toContain("session-bound user identity is not implemented");
    expect(result.publicSaleScore).toBe(5);
  });

  it("rejects weak personal-use configuration before giving a 10/10 private owner score", () => {
    const result = evaluateSaleReadiness({
      NITSYCLAW_DASHBOARD_PASSWORD: "secret",
      DATABASE_URL: "postgres://example",
      ANTHROPIC_API_KEY: "anthropic",
      ENCRYPTION_KEY: "base64-key",
      WHATSAPP_OWNER_NUMBER: "+61430008008",
    });

    expect(result.privateUseScore).toBeLessThan(10);
    expect(result.privateUseBlockers).toContain("owner dashboard password is missing or too weak");
    expect(result.privateUseBlockers).toContain("storage encryption key is missing or invalid");
  });

  it("reports a 10/10 private owner score when personal-use production basics are strongly configured", () => {
    const result = evaluateSaleReadiness({
      NITSYCLAW_DASHBOARD_PASSWORD: "Behappy008008",
      DATABASE_URL: "postgres://example",
      ANTHROPIC_API_KEY: "anthropic",
      ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      WHATSAPP_OWNER_NUMBER: "+61430008008",
    });

    expect(result.privateUseScore).toBe(10);
    expect(result.privateUseBlockers).toEqual([]);
    expect(result.verified).toContain("owner dashboard password");
    expect(result.verified).toContain("storage encryption");
  });
});
