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
    expect(result.userFacingText).not.toContain("Saved");
  });

  it("approval-gates normal human wording for bookings and orders", () => {
    expect(analyzePersonalPaIntent("schedule an appointment with the mechanic").kind).toBe("approval_required");
    expect(analyzePersonalPaIntent("order my medicine from the pharmacy").kind).toBe("approval_required");
    expect(analyzePersonalPaIntent("connect my Gmail account").kind).toBe("approval_required");
  });

  it("does not let a confirmation word hide a risky external action", () => {
    const result = analyzePersonalPaIntent("yes please send it to Mukesh now");

    expect(result.kind).toBe("approval_required");
    expect(result.userFacingText).toContain("approval");
  });

  it("lets clear safe research or comparison requests proceed", () => {
    const result = analyzePersonalPaIntent("Compare electricity plans for Melbourne and recommend the best option");

    expect(result.kind).toBe("actionable");
    expect(result.question).toBeUndefined();
    expect(result.userFacingText).not.toContain("Saved");
  });

  it("treats short weather requests as actionable", () => {
    const result = analyzePersonalPaIntent("weather today");

    expect(result.kind).toBe("actionable");
    expect(result.question).toBeUndefined();
  });

  it("treats repeat/read/hear last-message requests as safe local recall", () => {
    expect(analyzePersonalPaIntent("hear my last message").kind).toBe("actionable");
    expect(analyzePersonalPaIntent("read my last message").kind).toBe("actionable");
    expect(analyzePersonalPaIntent("what did I just say").kind).toBe("actionable");
  });

  it("treats feature capture as safe even when the requested feature mentions risky actions", () => {
    const result = analyzePersonalPaIntent("/addfeature send email drafts after I approve them");

    expect(result.kind).toBe("actionable");
    expect(result.question).toBeUndefined();
  });
});
