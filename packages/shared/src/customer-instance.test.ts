import { describe, expect, it } from "vitest";

import {
  assertCustomerInstanceCanSell,
  createCustomerInstance,
  evaluateCustomerInstanceReadiness,
} from "./customer-instance.js";

describe("customer instance model", () => {
  it("creates a private-owner instance for current personal use", () => {
    const instance = createCustomerInstance({ ownerHash: "nitesh-owner", displayName: "Nitesh" });

    expect(instance).toMatchObject({
      instanceId: "private-owner:nitesh-owner",
      ownerHash: "nitesh-owner",
      mode: "private-owner",
      stage: "personal",
      allowedSurfaces: ["whatsapp", "dashboard"],
    });
    expect(instance.tenant).toEqual({
      tenantId: "private-owner:nitesh-owner",
      ownerHash: "nitesh-owner",
      mode: "private-owner",
    });
  });

  it("keeps customer pilots blocked from public sale until tenant storage is verified", () => {
    const readiness = evaluateCustomerInstanceReadiness({
      instanceId: "pilot-acme",
      ownerHash: "acme-owner",
      displayName: "Acme Pilot",
      mode: "customer",
      stage: "pilot",
    });

    expect(readiness.canUseForPersonal).toBe(false);
    expect(readiness.canPilotWithHumanSetup).toBe(true);
    expect(readiness.canSellPublicly).toBe(false);
    expect(readiness.blockers.join(" ")).toContain("tenant-scoped storage is missing");
    expect(readiness.nextActions[0]).toContain("pilot mode");
  });

  it("does not allow env flags alone to sell customer instances", () => {
    const readiness = evaluateCustomerInstanceReadiness(
      {
        instanceId: "public-acme",
        ownerHash: "acme-owner",
        mode: "customer",
        stage: "public-sale",
      },
      {
        NITSYCLAW_PUBLIC_SALE_MODE: "1",
        NITSYCLAW_AUTH_MODEL: "multi-user",
        NITSYCLAW_TENANT_ISOLATION: "verified",
      },
    );

    expect(readiness.canSellPublicly).toBe(false);
    expect(() => assertCustomerInstanceCanSell(readiness)).toThrow(/not safe to sell/);
  });

  it("requires a dashboard surface for customer instances", () => {
    const readiness = evaluateCustomerInstanceReadiness({
      ownerHash: "customer-owner",
      mode: "customer",
      stage: "pilot",
      allowedSurfaces: ["whatsapp"],
    });

    expect(readiness.blockers).toContain("customer instances need a dashboard control surface");
  });

  it("rejects unsafe customer identifiers", () => {
    expect(() => createCustomerInstance({ instanceId: "../secret", ownerHash: "owner" })).toThrow(/identifiers/);
  });
});
