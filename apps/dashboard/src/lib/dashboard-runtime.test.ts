import { describe, expect, it } from "vitest";
import { encryptDashboardText, getOwnerIdentity, publicConfigError } from "./dashboard-runtime.js";

describe("dashboard runtime guards", () => {
  it("fails closed when owner phone is missing", () => {
    expect(() => getOwnerIdentity({} as NodeJS.ProcessEnv)).toThrow(/WHATSAPP_OWNER_NUMBER/);
  });

  it("allows plaintext only outside production when encryption is missing", () => {
    expect(encryptDashboardText("hello", { NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe("hello");
  });

  it("requires encryption key in production", () => {
    expect(() => encryptDashboardText("hello", { NODE_ENV: "production" } as NodeJS.ProcessEnv)).toThrow(/ENCRYPTION_KEY/);
  });

  it("maps config errors to safe public messages", () => {
    expect(publicConfigError(new Error("WHATSAPP_OWNER_NUMBER is not configured"))).toEqual({
      reply: "Dashboard owner identity is not configured.",
      status: 503,
    });
  });
});
