import { describe, expect, it } from "vitest";
import {
  checkDashboardAuth,
  clearDashboardAuthAttempts,
  parseBasicAuth,
  recordDashboardAuthFailure,
} from "./dashboard-auth";

function basic(user: string, password: string) {
  return `Basic ${btoa(`${user}:${password}`)}`;
}

describe("dashboard auth", () => {
  it("parses basic auth credentials", () => {
    expect(parseBasicAuth(basic("nitesh", "secret"))).toEqual({
      user: "nitesh",
      password: "secret",
    });
  });

  it("allows local development when no password is configured", () => {
    expect(checkDashboardAuth(null, { nodeEnv: "development" })).toEqual({ ok: true });
  });

  it("fails closed in production when no password is configured", () => {
    expect(checkDashboardAuth(null, { nodeEnv: "production" })).toEqual({
      ok: false,
      reason: "not-configured",
    });
  });

  it("rejects missing credentials when a password is configured", () => {
    expect(checkDashboardAuth(null, {
      nodeEnv: "production",
      dashboardPassword: "secret",
    })).toEqual({ ok: false, reason: "missing-header" });
  });

  it("rejects invalid credentials", () => {
    expect(checkDashboardAuth(basic("nitesh", "wrong"), {
      nodeEnv: "production",
      dashboardPassword: "secret",
    })).toEqual({ ok: false, reason: "invalid" });
  });

  it("accepts valid credentials with the default user", () => {
    expect(checkDashboardAuth(basic("nitesh", "secret"), {
      nodeEnv: "production",
      dashboardPassword: "secret",
    })).toEqual({ ok: true });
  });

  it("accepts valid credentials with a configured user", () => {
    expect(checkDashboardAuth(basic("owner", "secret"), {
      nodeEnv: "production",
      dashboardUser: "owner",
      dashboardPassword: "secret",
    })).toEqual({ ok: true });
  });

  it("locks a client after repeated invalid credentials", () => {
    clearDashboardAuthAttempts();
    const env = {
      nodeEnv: "production",
      dashboardPassword: "secret",
    };

    for (let i = 0; i < 5; i++) {
      expect(checkDashboardAuth(basic("nitesh", "wrong"), env, {
        clientKey: "203.0.113.10",
        nowMs: 1_000,
      })).toEqual({ ok: false, reason: "invalid" });
    }

    expect(checkDashboardAuth(basic("nitesh", "secret"), env, {
      clientKey: "203.0.113.10",
      nowMs: 1_001,
    })).toEqual({ ok: false, reason: "locked" });
  });

  it("expires auth lockout after the configured window", () => {
    clearDashboardAuthAttempts();
    const env = {
      nodeEnv: "production",
      dashboardPassword: "secret",
    };

    for (let i = 0; i < 5; i++) {
      recordDashboardAuthFailure("203.0.113.11", 1_000);
    }

    expect(checkDashboardAuth(basic("nitesh", "secret"), env, {
      clientKey: "203.0.113.11",
      nowMs: 16 * 60_000 + 1_000,
    })).toEqual({ ok: true });
  });
});
