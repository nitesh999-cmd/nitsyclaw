import { describe, expect, test, vi } from "vitest";

describe("bot secret paths", () => {
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
});
