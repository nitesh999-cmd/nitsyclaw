import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const requiredCloseoutLines = [
  "After every completed action item, finish with:",
  "1. Next best revenue move after the last action item - the next practical action most likely to help us get paid.",
  "2. Failure-prevention move - the next practical action most likely to stop the product breaking, disappointing users, or becoming unlaunchable.",
  "3. My recommendation - which one to do next and why.",
];

const productStudioStandardLine =
  "For new product/service ideas, revenue offers, AppSumo-style packaging, pitch decks, or major market-positioning work, use `docs/product-studio-planning-standard.md` before coding.";

describe("project agent instructions", () => {
  it("keeps Codex and Claude aligned on the action-item closeout rule", () => {
    for (const file of ["AGENTS.md", "CLAUDE.md"]) {
      const source = readFileSync(file, "utf8");
      for (const line of requiredCloseoutLines) {
        expect(source, `${file} should include: ${line}`).toContain(line);
      }
    }
  });

  it("keeps Codex and Claude aligned on the product studio planning standard", () => {
    const standard = readFileSync("docs/product-studio-planning-standard.md", "utf8");
    expect(standard).toContain("Product Studio Planning Standard");
    expect(standard).toContain("Use real competitor evidence where possible.");
    expect(standard).toContain("End with the next 5 highest-leverage actions.");

    for (const file of ["AGENTS.md", "CLAUDE.md"]) {
      expect(readFileSync(file, "utf8"), `${file} should reference the planning standard`).toContain(
        productStudioStandardLine,
      );
    }
  });
});
