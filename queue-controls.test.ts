import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("queue admin controls", () => {
  it("renders update controls on the queue page", () => {
    const source = readFileSync("apps/dashboard/src/app/queue/page.tsx", "utf8");
    expect(source).toContain('action="/api/queue/update"');
    expect(source).toContain('name="expectedStatus"');
    expect(source).toContain('name="status"');
    expect(source).toContain('value="in_progress"');
    expect(source).toContain('value="rejected"');
    expect(source).toContain('name="note"');
    expect(source).toContain("Queue is a holding area, not an auto-deploy button");
    expect(source).toContain("How queued work becomes real");
    expect(source).toContain("Saved -> Ready -> Running -> Done/Blocked");
    expect(source).toContain("Ready means safe enough for a runner to claim");
    expect(source).toContain("Done or blocked means shipped with proof or waiting on a real blocker");
    expect(source).toContain("Operator runner claims one safe item");
  });

  it("validates queue update inputs before mutating DB", () => {
    const source = readFileSync("apps/dashboard/src/app/api/queue/update/route.ts", "utf8");
    const repo = readFileSync("packages/shared/src/db/repo.ts", "utf8");

    expect(source).toContain("UUID_PATTERN");
    expect(source).toContain("VALID_STATUSES");
    expect(source).toContain("expectedStatus");
    expect(source).toContain("setFeatureRequestStatus");
    expect(source).toContain('redirect("/queue")');
    expect(repo).toContain("expectedStatus");
    expect(repo).toContain("and(eq(featureRequests.id, id), eq(featureRequests.status, expectedStatus))");
  });
});
