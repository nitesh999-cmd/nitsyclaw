import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const railwayConfig = JSON.parse(readFileSync("railway.json", "utf8")) as {
  build?: {
    watchPatterns?: string[];
  };
  deploy?: {
    healthcheckPath?: string;
    healthcheckTimeout?: number;
    restartPolicyType?: string;
    restartPolicyMaxRetries?: number;
  };
};

describe("Railway production bot config", () => {
  it("does not redeploy WhatsApp for dashboard-only changes", () => {
    expect(railwayConfig.build?.watchPatterns).toEqual([
      "apps/bot/**",
      "packages/shared/**",
      "Dockerfile",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "railway.json",
      "scripts/docker-entrypoint.sh",
    ]);
  });

  it("requires an explicit healthcheck and bounded restart policy", () => {
    expect(railwayConfig.deploy).toMatchObject({
      healthcheckPath: "/healthz",
      healthcheckTimeout: 60,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
    });
  });
});
