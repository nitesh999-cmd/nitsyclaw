import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("build agent pending API", () => {
  it("returns an authenticated redacted read-only queue mirror", () => {
    const source = readFileSync("apps/dashboard/src/app/api/build-agent/pending/route.ts", "utf8");

    expect(source).toContain("requireBuildAgentAuth");
    expect(source).toContain("buildFeatureQueueMirror");
    expect(source).toContain("listPendingFeatureRequests");
    expect(source).not.toContain("NextResponse.json({ rows }");
  });
});
