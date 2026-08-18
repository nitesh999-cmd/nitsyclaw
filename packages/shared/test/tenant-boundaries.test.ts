import { describe, expect, it } from "vitest";

import {
  assertPublicSaleTenantBoundaries,
  evaluateTenantBoundaries,
  privateOwnerTenant,
  requireTenantContext,
  tableIsTenantScoped,
  tableRequiresTenantMigration,
  TENANT_TABLE_BOUNDARIES,
} from "../src/tenancy.js";

describe("tenant boundary readiness", () => {
  it("documents that scoped storage is ready while public sale remains blocked by auth and review gaps", () => {
    const readiness = evaluateTenantBoundaries({});

    expect(readiness.mode).toBe("private-owner");
    expect(readiness.codeReadyForPublicSale).toBe(true);
    expect(readiness.safeForPublicSale).toBe(false);
    expect(readiness.blockers).toContain("multi-user auth is not verified");
    expect(readiness.blockers.join(" ")).not.toContain("memories");
    expect(readiness.blockers.join(" ")).not.toContain("expenses");
    expect(readiness.blockers.join(" ")).toContain("tenant review is still needed");
    expect(readiness.nextActions[0]).toContain("account-aware dashboard sessions");
  });

  it("does not allow env flags to bypass tables that still need tenant review", () => {
    const readiness = evaluateTenantBoundaries({
      NITSYCLAW_PUBLIC_SALE_MODE: "1",
      NITSYCLAW_AUTH_MODEL: "multi-user",
      NITSYCLAW_TENANT_ISOLATION: "verified",
    });

    expect(readiness.mode).toBe("public-sale");
    expect(readiness.safeForPublicSale).toBe(false);
    expect(readiness.blockers.join(" ")).toContain("tenant review is still needed");
  });

  it("throws if public sale mode is enabled before tenant boundaries are complete", () => {
    expect(() => assertPublicSaleTenantBoundaries({
      NITSYCLAW_PUBLIC_SALE_MODE: "1",
      NITSYCLAW_AUTH_MODEL: "multi-user",
      NITSYCLAW_TENANT_ISOLATION: "verified",
    })).toThrow(/Public sale mode is blocked/);
  });

  it("keeps connected accounts and command jobs tenant-scoped", () => {
    expect(TENANT_TABLE_BOUNDARIES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "connected_accounts", scopeColumn: "owner_hash", publicSaleRisk: "ok" }),
        expect.objectContaining({ table: "command_jobs", scopeColumn: "owner_hash", publicSaleRisk: "ok" }),
      ]),
    );
  });

  it("provides explicit tenant context primitives for future repo methods", () => {
    expect(privateOwnerTenant("owner-hash")).toEqual({
      tenantId: "owner-hash",
      ownerHash: "owner-hash",
      mode: "private-owner",
    });
    expect(requireTenantContext(privateOwnerTenant("owner-hash")).ownerHash).toBe("owner-hash");
    expect(() => requireTenantContext(null)).toThrow(/tenant context is required/);
  });

  it("classifies tables for repo-level guardrails", () => {
    expect(tableRequiresTenantMigration("expenses")).toBe(false);
    expect(tableRequiresTenantMigration("reminders")).toBe(false);
    expect(tableIsTenantScoped("memories")).toBe(true);
    expect(tableIsTenantScoped("reminders")).toBe(true);
    expect(tableIsTenantScoped("expenses")).toBe(true);
    expect(tableIsTenantScoped("briefs")).toBe(true);
    expect(tableIsTenantScoped("confirmations")).toBe(true);
    expect(tableIsTenantScoped("connected_accounts")).toBe(true);
    expect(tableIsTenantScoped("command_jobs")).toBe(true);
  });
});
