import { afterEach, describe, expect, it, vi } from "vitest";
import {
  encryptDashboardText,
  getOwnerIdentity,
  logDashboardError,
  logDashboardLoadError,
  publicConfigError,
  publicConfigErrorOrNull,
} from "./dashboard-runtime.js";

describe("dashboard runtime guards", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails closed when owner phone is missing", () => {
    expect(() => getOwnerIdentity({} as NodeJS.ProcessEnv)).toThrow(/WHATSAPP_OWNER_NUMBER/);
  });

  it("allows plaintext only with explicit local opt-in when encryption is missing", () => {
    expect(encryptDashboardText("hello", {
      NODE_ENV: "development",
      ALLOW_PLAINTEXT_DB: "true",
    } as NodeJS.ProcessEnv)).toBe("hello");
  });

  it("rejects implicit plaintext storage outside production", () => {
    expect(() => encryptDashboardText("hello", { NODE_ENV: "development" } as NodeJS.ProcessEnv)).toThrow(/ENCRYPTION_KEY/);
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

  it("does not classify ordinary runtime errors as configuration errors", () => {
    expect(publicConfigErrorOrNull(new Error("Anthropic 529 overloaded"))).toBeNull();
  });

  it("logs expected config misses as controlled warnings", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    logDashboardLoadError("health", new Error("DATABASE_URL is missing"));

    expect(warn).toHaveBeenCalledWith(
      "[dashboard] expected configuration miss",
      expect.objectContaining({
        scope: "health",
        reply: "Dashboard database is not configured.",
        status: 503,
      }),
    );
    expect(error).not.toHaveBeenCalled();
  });

  it("logs unexpected runtime failures as redacted errors", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("Anthropic 529 failed for nitesh@example.com +61430008008 sk-test-secret-1234567890");

    logDashboardLoadError("command", cause);

    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      "[dashboard] load failed",
      expect.objectContaining({
        scope: "command",
        error: expect.objectContaining({
          name: "Error",
          message: expect.stringContaining("[redacted"),
        }),
      }),
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain("nitesh@example.com");
    expect(JSON.stringify(error.mock.calls)).not.toContain("+61430008008");
    expect(JSON.stringify(error.mock.calls)).not.toContain("sk-test-secret");
  });

  it("logs generic dashboard failures through the same redaction path", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    logDashboardError("chat", new Error("failed for person@example.com"));

    expect(error).toHaveBeenCalledWith(
      "[dashboard] operation failed",
      expect.objectContaining({
        scope: "chat",
        error: expect.objectContaining({
          message: expect.stringContaining("[redacted:email]"),
        }),
      }),
    );
  });
});
