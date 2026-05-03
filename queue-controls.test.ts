import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("queue admin controls", () => {
  it("renders update controls on the queue page", () => {
    const source = readFileSync("apps/dashboard/src/app/queue/page.tsx", "utf8");
    expect(source).toContain('action="/api/queue/update"');
    expect(source).toContain('name="status"');
    expect(source).toContain('value="in_progress"');
    expect(source).toContain('value="rejected"');
    expect(source).toContain('name="note"');
  });

  it("validates queue update inputs before mutating DB", () => {
    const source = readFileSync("apps/dashboard/src/app/api/queue/update/route.ts", "utf8");
    expect(source).toContain("UUID_PATTERN");
    expect(source).toContain("VALID_STATUSES");
    expect(source).toContain("setFeatureRequestStatus");
    expect(source).toContain('redirect("/queue")');
  });
});
