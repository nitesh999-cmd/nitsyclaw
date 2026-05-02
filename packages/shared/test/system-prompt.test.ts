import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/agent/system-prompt.js";

describe("buildSystemPrompt", () => {
  it("uses Melbourne as the default weather location", () => {
    const prompt = buildSystemPrompt({ surface: "whatsapp" });

    expect(prompt).toContain("Melbourne, Victoria, Australia");
    expect(prompt).toContain("Otherwise use the current/default weather location above");
    expect(prompt).toContain("Weather replies must name the location used");
  });

  it("can use a temporary current location without replacing home", () => {
    const prompt = buildSystemPrompt({
      surface: "dashboard",
      profile: {
        homeLocation: "Melbourne, Victoria, Australia",
        currentLocation: "Brisbane, Queensland, Australia",
        timezone: "Australia/Melbourne",
      },
    });

    expect(prompt).toContain("home/default location is Melbourne, Victoria, Australia");
    expect(prompt).toContain("current/default weather location is Brisbane, Queensland, Australia");
    expect(prompt).toContain("do not permanently change his home location");
  });
});
