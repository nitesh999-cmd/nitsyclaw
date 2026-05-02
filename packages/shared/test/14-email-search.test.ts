import { describe, expect, it } from "vitest";
import { searchGmailInbox } from "../src/features/14-email-search.js";
import { makeAgentDeps } from "./helpers.js";

describe("email search", () => {
  it("uses injected Gmail aggregator when available", async () => {
    const deps = makeAgentDeps({
      aggregator: {
        async fetchAllEventsToday() {
          return [];
        },
        async fetchAllUnreadEmails() {
          return [];
        },
        async searchAllGmail(query, limit) {
          return [{
            id: "m1",
            source: "Gmail (personal)",
            from: "alex@example.com",
            subject: `Match ${query}`,
            date: new Date("2026-04-25T10:00:00Z"),
            snippet: `limit ${limit}`,
          }];
        },
      },
    });

    const out = await searchGmailInbox(
      { query: "invoice", limit: 3 },
      { deps, userPhone: "+61430008008", now: deps.now(), timezone: deps.timezone },
    );

    expect(out.count).toBe(1);
    expect(out.items[0]?.subject).toBe("Match invoice");
    expect(out.items[0]?.snippet).toBe("limit 3");
  });

  it("falls back to empty results without an aggregator", async () => {
    const deps = makeAgentDeps();
    const out = await searchGmailInbox(
      { query: "invoice" },
      { deps, userPhone: "+61430008008", now: deps.now(), timezone: deps.timezone },
    );
    expect(out.count).toBe(0);
  });
});
