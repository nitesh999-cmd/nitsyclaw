import { describe, expect, it } from "vitest";
import { analyzePersonalPaIntent } from "../src/ops/personal-pa-intent.js";

describe("personal PA intent clarification", () => {
  it("asks a short clarification question for emotional but unclear speech", () => {
    const result = analyzePersonalPaIntent("I can't deal with this anymore, this is too much");

    expect(result.kind).toBe("needs_clarification");
    expect(result.question).toContain("What is the main thing");
    expect(result.userFacingText).toContain("I hear you");
  });

  it("asks who/what before acting on vague referenced commands", () => {
    const result = analyzePersonalPaIntent("call him now");

    expect(result.kind).toBe("needs_clarification");
    expect(result.question).toContain("Who");
    expect(result.userFacingText).toContain("Who");
  });

  it("flags risky external actions as approval required", () => {
    const result = analyzePersonalPaIntent("send this message to Mukesh");

    expect(result.kind).toBe("approval_required");
    expect(result.userFacingText).toContain("approval");
  });

  it("lets clear safe research or comparison requests proceed", () => {
    const result = analyzePersonalPaIntent("Compare electricity plans for Melbourne and recommend the best option");

    expect(result.kind).toBe("actionable");
    expect(result.question).toBeUndefined();
  });
});
