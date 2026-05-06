import { describe, expect, it } from "vitest";
import { CHAT_QUICK_ACTIONS, findQuickActionById } from "./chat-quick-actions";

describe("chat quick actions", () => {
  it("offers ten normal-human home actions", () => {
    expect(CHAT_QUICK_ACTIONS).toHaveLength(10);
    expect(CHAT_QUICK_ACTIONS.map((action) => action.id)).toEqual([
      "sort-actions",
      "clean-note",
      "draft-reply",
      "compare-options",
      "call-script",
      "renewal-watch",
      "complaint",
      "check-message",
      "travel-day",
      "triage-admin",
    ]);
  });

  it("uses plain home language without internal AI jargon", () => {
    const copy = CHAT_QUICK_ACTIONS.flatMap((action) => [action.label, action.helper, action.prompt]).join(" ");

    expect(copy).not.toMatch(/\b(ai|agent|workflow|prompt|llm|autonomous|control plane)\b/i);
    expect(copy).toContain("Find my next steps");
    expect(copy).toContain("Make this note tidy");
    expect(copy).toContain("Check before I send");
  });

  it("returns a complete prompt for each quick action", () => {
    for (const action of CHAT_QUICK_ACTIONS) {
      expect(action.prompt).toContain("[paste");
      expect(action.prompt.length).toBeGreaterThan(40);
    }

    expect(findQuickActionById("travel-day")?.prompt).toContain("travel day");
    expect(findQuickActionById("missing")).toBeUndefined();
  });
});
