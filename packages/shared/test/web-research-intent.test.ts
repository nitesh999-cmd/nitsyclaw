import { describe, expect, it } from "vitest";
import { isExplicitLiveWebResearchRequest } from "../src/search/web-research-intent.js";

describe("isExplicitLiveWebResearchRequest", () => {
  it("detects the exact sanitized live proof request", () => {
    expect(
      isExplicitLiveWebResearchRequest("Give me five verified world news headlines from today with sources."),
    ).toBe(true);
  });

  it("fires on the live defect: an explicit request for today's news", () => {
    expect(isExplicitLiveWebResearchRequest("give me today's world news")).toBe(true);
    expect(
      isExplicitLiveWebResearchRequest("Give me today's world news and 20 current stories"),
    ).toBe(true);
  });

  it("fires on direct instructions to search", () => {
    for (const text of [
      "search the web for solar rebates in Victoria",
      "can you search online for the ASX close",
      "google it and tell me",
      "look it up online",
      "do a web search on this",
    ]) {
      expect(isExplicitLiveWebResearchRequest(text)).toBe(true);
    }
  });

  it("fires on live-only topics", () => {
    for (const text of [
      "what's the weather in Melbourne",
      "petrol price near me",
      "bitcoin price right now",
      "who won the cricket",
      "latest headlines please",
    ]) {
      expect(isExplicitLiveWebResearchRequest(text)).toBe(true);
    }
  });

  it("fires on a recency marker paired with a live subject", () => {
    expect(isExplicitLiveWebResearchRequest("any current updates on the port strike?")).toBe(true);
    expect(isExplicitLiveWebResearchRequest("what are the latest developments")).toBe(true);
  });

  it("does not divert requests scoped to the owner's own data", () => {
    for (const text of [
      "what's the latest on my reminders",
      "search my email for the AGL bill",
      "show me my latest expenses",
      "read my messages from today",
      "check my calendar for today",
    ]) {
      expect(isExplicitLiveWebResearchRequest(text)).toBe(false);
    }
  });

  it("does not divert bot-internal status commands", () => {
    for (const text of [
      "feature queue",
      "run morning brief now",
      "nightly health report",
      "what went wrong",
      "local brain status",
    ]) {
      expect(isExplicitLiveWebResearchRequest(text)).toBe(false);
    }
  });

  it("does not fire on ordinary conversation or stable knowledge", () => {
    for (const text of [
      "hi",
      "what is the capital of Brazil",
      "remind me to call Mukesh tomorrow at 10am",
      "I spent $18.40 at the chemist",
      "how do I make pasta carbonara",
      "",
    ]) {
      expect(isExplicitLiveWebResearchRequest(text)).toBe(false);
    }
  });
});
