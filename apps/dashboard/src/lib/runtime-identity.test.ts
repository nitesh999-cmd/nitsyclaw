import { describe, expect, test } from "vitest";
import {
  buildDashboardRuntimeMetadata,
  runtimeCommitMismatch,
} from "./runtime-identity";

describe("dashboard runtime identity", () => {
  test("captures Vercel commit identity without exposing secrets", () => {
    const metadata = buildDashboardRuntimeMetadata({
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_SHA: "abcdef1234567890",
      VERCEL_DEPLOYMENT_ID: "dpl_123",
      VERCEL_URL: "nitsyclaw.vercel.app",
      DATABASE_URL: "postgres://secret",
      ANTHROPIC_API_KEY: "sk-secret",
    });

    expect(metadata).toMatchObject({
      platform: "vercel",
      environment: "production",
      commit: "abcdef1234567890",
      commitShort: "abcdef1",
      deploymentId: "dpl_123",
      url: "nitsyclaw.vercel.app",
    });
    expect(JSON.stringify(metadata)).not.toContain("postgres://secret");
    expect(JSON.stringify(metadata)).not.toContain("sk-secret");
  });

  test("detects dashboard and bot commit mismatch only when both are known", () => {
    expect(
      runtimeCommitMismatch("abcdef1234567890", {
        metadata: { commit: "abcdef1234567890" },
      }),
    ).toBe(false);

    expect(
      runtimeCommitMismatch("abcdef1234567890", {
        metadata: { commit: "1234567890abcdef" },
      }),
    ).toBe(true);

    expect(runtimeCommitMismatch("unknown", { metadata: { commit: "1234567" } })).toBe(false);
    expect(runtimeCommitMismatch("abcdef1234567890", null)).toBe(false);
  });
});
