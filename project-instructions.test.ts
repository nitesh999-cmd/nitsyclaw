import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const requiredCloseoutLines = [
  "After every completed action item, finish with:",
  "1. Next best revenue move after the last action item - the next practical action most likely to help us get paid.",
  "2. Failure-prevention move - the next practical action most likely to stop the product breaking, disappointing users, or becoming unlaunchable.",
  "3. My recommendation - which one to do next and why.",
];

describe("project agent instructions", () => {
  it("keeps Codex and Claude aligned on the action-item closeout rule", () => {
    for (const file of ["AGENTS.md", "CLAUDE.md"]) {
      const source = readFileSync(file, "utf8");
      for (const line of requiredCloseoutLines) {
        expect(source, `${file} should include: ${line}`).toContain(line);
      }
    }
  });
});
