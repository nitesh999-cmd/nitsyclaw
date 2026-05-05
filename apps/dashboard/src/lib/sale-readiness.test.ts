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
  });
});
