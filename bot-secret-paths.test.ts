import { afterEach, describe, expect, test, vi } from "vitest";

describe("bot secret paths", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("defaults private files outside the repository", async () => {
    vi.resetModules();
    vi.stubEnv("NITSYCLAW_SECRET_ROOT", "C:/Users/Nitesh/.nitsyclaw/secrets-test");

    const paths = await import("./apps/bot/src/secret-paths");

    expect(paths.secretPath("google-token-personal.json").replaceAll("\\", "/")).toBe(
      "C:/Users/Nitesh/.nitsyclaw/secrets-test/google-token-personal.json",
    );
    expect(paths.whatsappSessionDir(".wa-session").replaceAll("\\", "/")).toBe(
      "C:/Users/Nitesh/.nitsyclaw/secrets-test/.wa-session",
    );
  });

  test("rejects traversal and unapproved absolute session paths", async () => {
    vi.resetModules();
    vi.stubEnv("NITSYCLAW_SECRET_ROOT", "C:/Users/Nitesh/.nitsyclaw/secrets-test");

    const paths = await import("./apps/bot/src/secret-paths");

    expect(() => paths.secretPath("../outside.env")).toThrow(/inside NITSYCLAW_SECRET_ROOT/);
    expect(() => paths.whatsappSessionDir("../outside-session")).toThrow(/inside NITSYCLAW_SECRET_ROOT/);
    expect(() => paths.whatsappSessionDir("C:/tmp/.wa-session")).toThrow(/must be relative/);
  });

  test("allows absolute mounted session paths only when explicitly enabled", async () => {
    vi.resetModules();
    vi.stubEnv("NITSYCLAW_ALLOW_ABSOLUTE_SECRET_PATHS", "1");

    const paths = await import("./apps/bot/src/secret-paths");

    expect(paths.whatsappSessionDir("C:/tmp/.wa-session").replaceAll("\\", "/")).toBe(
      "C:/tmp/.wa-session",
    );
  });
});
