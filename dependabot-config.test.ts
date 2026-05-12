import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dependabot config", () => {
  const source = readFileSync(".github/dependabot.yml", "utf8");

  it("keeps dependency security updates enabled for runtime and CI", () => {
    expect(source).toContain("package-ecosystem: npm");
    expect(source).toContain("package-ecosystem: github-actions");
    expect(source).toContain("interval: daily");
    expect(source).toContain("next-runtime");
    expect(source).toContain("- next");
    expect(source).toContain("open-pull-requests-limit: 5");
  });
});
