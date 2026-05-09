import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const agentsDir = ".claude/agents";

describe("Claude project agents", () => {
  test("keeps project agents read-only and scoped", () => {
    expect(existsSync(agentsDir)).toBe(true);

    const files = readdirSync(agentsDir).filter((file) => file.endsWith(".md")).sort();
    expect(files).toEqual([
      "nitsyclaw-ops-reviewer.md",
      "nitsyclaw-security-reviewer.md",
      "nitsyclaw-ux-reviewer.md",
    ]);

    for (const file of files) {
      const source = readFileSync(`${agentsDir}/${file}`, "utf8");
      expect(source).toContain("tools: Read, Grep, Glob");
      expect(source.toLowerCase()).toContain("read-only");
      expect(source).toContain("Do not edit files.");
      expect(source).toContain("Do not run shell commands.");
      expect(source).not.toMatch(/\b(Bash|Edit|Write|MultiEdit|NotebookEdit|WebFetch|WebSearch)\b/);
    }
  });

  test("documents tool adoption without bulk third-party installs", () => {
    const source = readFileSync("docs/tool-adoption.md", "utf8");
    expect(source).toContain("Do not clone or bulk-install community skill/agent repositories");
    expect(source).toContain("Semgrep");
    expect(source).toContain("Playwright");
    expect(source).toContain("npm audit");
    expect(source).toContain("Lighthouse");
    expect(source).toContain("Manual only");
    expect(source).toContain("RepoAudit");
    expect(source).toContain("Reject for V1");
  });
});
