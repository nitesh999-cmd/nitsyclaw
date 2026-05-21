import { describe, expect, it } from "vitest";
import {
  formatPrivateModeActionBlocked,
  formatPrivateModeHelp,
  isPrivateModeHelpRequest,
  parsePrivateModeInput,
  privateModeWouldPersist,
} from "../src/utils/private-mode.js";

describe("private mode utility", () => {
  it("detects explicit private prefixes and strips the prefix", () => {
    expect(parsePrivateModeInput("private: help me rewrite this")).toMatchObject({
      privateMode: true,
      text: "help me rewrite this",
      source: "prefix",
    });
    expect(parsePrivateModeInput("Don't save: compare these two options")?.text).toBe("compare these two options");
  });

  it("supports dashboard explicit private mode flags", () => {
    expect(parsePrivateModeInput("help me with something sensitive", true)).toMatchObject({
      privateMode: true,
      text: "help me with something sensitive",
      source: "flag",
    });
  });

  it("blocks private-mode turns that would need persistence or external action", () => {
    expect(privateModeWouldPersist("remind me tomorrow")).toBe(true);
    expect(privateModeWouldPersist("send this to John")).toBe(true);
    expect(privateModeWouldPersist("summarise this paragraph")).toBe(false);
  });

  it("has user-facing help and blocked-action copy", () => {
    expect(isPrivateModeHelpRequest("private mode")).toBe(true);
    expect(formatPrivateModeHelp()).toContain("Use: private: your question");
    expect(formatPrivateModeActionBlocked()).toContain("I can answer or draft");
  });
});
