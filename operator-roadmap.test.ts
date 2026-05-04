import { describe, expect, it } from "vitest";
import { OPERATOR_NEXT_50 } from "./apps/dashboard/src/app/command/operator-roadmap";

describe("operator next 50 roadmap", () => {
  it("defines fifty concrete next-level product moves", () => {
    expect(OPERATOR_NEXT_50).toHaveLength(50);

    const ids = new Set(OPERATOR_NEXT_50.map((item) => item.id));
    expect(ids.size).toBe(OPERATOR_NEXT_50.length);

    for (const item of OPERATOR_NEXT_50) {
      expect(item.id).toMatch(/^[a-z0-9-]+$/);
      expect(item.title.length).toBeGreaterThan(8);
      expect(item.category.length).toBeGreaterThan(3);
      expect(item.description.length).toBeGreaterThan(70);
      expect(item.why.length).toBeGreaterThan(35);
      expect(item.description).not.toMatch(/todo|placeholder|implement here|tbd/i);
    }
  });

  it("covers personal use, product trust, automation, and sellable SaaS readiness", () => {
    const categories = new Set(OPERATOR_NEXT_50.map((item) => item.category));
    expect(categories).toContain("Personal AI");
    expect(categories).toContain("Trust");
    expect(categories).toContain("Automation");
    expect(categories).toContain("SaaS");
  });
});

