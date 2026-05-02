import { describe, expect, it } from "vitest";
import {
  parseBugReportShortcut,
  parseFeatureQueueShortcut,
  parseLocationShortcut,
} from "./personal-command-shortcuts.js";

describe("personal command shortcuts", () => {
  it("parses temporary travel/current-location messages", () => {
    expect(parseLocationShortcut("I'm in Brisbane until Monday")).toEqual({
      city: "Brisbane",
      expiresHint: "Monday",
    });
    expect(parseLocationShortcut("use Sydney for weather this week")).toEqual({
      city: "Sydney",
      expiresHint: "this week",
    });
  });

  it("parses a return-home location command", () => {
    expect(parseLocationShortcut("back in Melbourne now")).toEqual({
      city: "Melbourne",
      expiresHint: undefined,
    });
  });

  it("does not treat ordinary sentences as location commands", () => {
    expect(parseLocationShortcut("I'm in trouble with a client")).toBeNull();
    expect(parseLocationShortcut("weather today")).toBeNull();
  });

  it("parses feature queue/status commands", () => {
    expect(parseFeatureQueueShortcut("feature status")).toEqual({ limit: 5 });
    expect(parseFeatureQueueShortcut("show feature queue")).toEqual({ limit: 5 });
  });

  it("parses explicit bug report shortcuts", () => {
    expect(parseBugReportShortcut("bug: weather picked Sydney instead of Melbourne")?.description).toBe(
      "weather picked Sydney instead of Melbourne",
    );
    expect(parseBugReportShortcut("report bug whatsapp loop came back")?.description).toBe(
      "whatsapp loop came back",
    );
    expect(parseBugReportShortcut("fix whatsapp loop")).toBeNull();
  });
});
