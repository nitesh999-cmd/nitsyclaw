import { describe, expect, it } from "vitest";
import { summarizeToday } from "../src/features/05-whats-on-my-plate.js";
import { makeAgentDeps } from "./helpers.js";

describe("summarizeToday", () => {
  it("returns 'wide open' when nothing scheduled", async () => {
    const deps = makeAgentDeps();
    const r = await summarizeToday({ now: deps.now(), deps });
    expect(r.text).toContain("Wide open");
  });
});
