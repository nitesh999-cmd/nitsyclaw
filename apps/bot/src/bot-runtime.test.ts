import { describe, expect, test } from "vitest";
import { buildBotRuntimeMetadata } from "./bot-runtime";

describe("bot runtime metadata", () => {
  test("captures Railway deployment identity without exposing secrets", () => {
    const metadata = buildBotRuntimeMetadata(
      {
        RAILWAY_GIT_COMMIT_SHA: "abcdef1234567890",
        RAILWAY_DEPLOYMENT_ID: "deployment_123",
        RAILWAY_ENVIRONMENT_ID: "environment_123",
        RAILWAY_SERVICE_ID: "service_123",
        DATABASE_URL: "postgres://secret",
        ANTHROPIC_API_KEY: "sk-secret",
      },
      new Date("2026-05-13T02:00:00.000Z"),
    );

    expect(metadata).toMatchObject({
      platform: "railway",
      commit: "abcdef1234567890",
      commitShort: "abcdef1",
      deploymentId: "deployment_123",
      environmentId: "environment_123",
      serviceId: "service_123",
      startedAt: "2026-05-13T02:00:00.000Z",
    });
    expect(JSON.stringify(metadata)).not.toContain("postgres://secret");
    expect(JSON.stringify(metadata)).not.toContain("sk-secret");
  });

  test("falls back cleanly when Railway variables are absent", () => {
    const metadata = buildBotRuntimeMetadata({}, new Date("2026-05-13T02:00:00.000Z"));

    expect(metadata.platform).toBe("unknown");
    expect(metadata.commit).toBe("unknown");
    expect(metadata.commitShort).toBe("unknown");
    expect(metadata.startedAt).toBe("2026-05-13T02:00:00.000Z");
  });
});
