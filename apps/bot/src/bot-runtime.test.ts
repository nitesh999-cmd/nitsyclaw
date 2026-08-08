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
      { resolveGitCommit: () => "should-not-win" },
    );

    expect(metadata).toMatchObject({
      platform: "railway",
      commit: "abcdef1234567890",
      commitShort: "abcdef1",
      commitSource: "railway",
      deploymentId: "deployment_123",
      environmentId: "environment_123",
      serviceId: "service_123",
      startedAt: "2026-05-13T02:00:00.000Z",
    });
    expect(JSON.stringify(metadata)).not.toContain("postgres://secret");
    expect(JSON.stringify(metadata)).not.toContain("sk-secret");
  });

  test("detects the exact commit from a readable local Git worktree", () => {
    const metadata = buildBotRuntimeMetadata(
      {},
      new Date("2026-05-13T02:00:00.000Z"),
      { resolveGitCommit: () => "1234567890abcdef" },
    );

    expect(metadata.platform).toBe("local");
    expect(metadata.runtimeOwner).toBe("local");
    expect(metadata.commit).toBe("1234567890abcdef");
    expect(metadata.commitShort).toBe("1234567");
    expect(metadata.commitSource).toBe("git");
    expect(metadata.startedAt).toBe("2026-05-13T02:00:00.000Z");
  });

  test("reports commit unavailable with a reason outside Git", () => {
    const metadata = buildBotRuntimeMetadata(
      {},
      new Date("2026-05-13T02:00:00.000Z"),
      { resolveGitCommit: () => undefined },
    );

    expect(metadata.commit).toBe("unavailable");
    expect(metadata.commitShort).toBe("unavailable");
    expect(metadata.commitSource).toBe("unavailable");
    expect(metadata.commitReason).toContain("outside a readable Git worktree");
  });
});
