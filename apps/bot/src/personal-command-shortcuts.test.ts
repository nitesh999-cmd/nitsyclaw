import { describe, expect, it } from "vitest";
import {
  parseBuildAgentShortcut,
  parseBugReportShortcut,
  parseFeatureQueueShortcut,
  parseHomeAssistantShortcut,
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

  it("parses build agent trigger commands", () => {
    expect(parseBuildAgentShortcut("run build")).toEqual({ dryRun: false });
    expect(parseBuildAgentShortcut("trigger build agent")).toEqual({ dryRun: false });
    expect(parseBuildAgentShortcut("process feature queue")).toEqual({ dryRun: false });
    expect(parseBuildAgentShortcut("build status")).toEqual({ dryRun: true });
  });

  it("does not parse normal build words as build agent triggers", () => {
    expect(parseBuildAgentShortcut("build me a playlist")).toBeNull();
    expect(parseBuildAgentShortcut("run tomorrow morning")).toBeNull();
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

  it("parses ten home assistant shortcuts", () => {
    expect(parseHomeAssistantShortcut("next steps: pay bill. call dentist")?.kind).toBe("sort-actions");
    expect(parseHomeAssistantShortcut("tidy note: remember car rego maybe due")?.kind).toBe("clean-note");
    expect(parseHomeAssistantShortcut("reply draft: Maya | Sunday lunch invite | decline kindly")?.kind).toBe("draft-reply");
    expect(parseHomeAssistantShortcut("choose: internet plan | Cheap plan; low price; slow upload | Reliable plan; stable; better support | reliability")?.kind).toBe("compare-options");
    expect(parseHomeAssistantShortcut("call script: Energy retailer | ask for better rate | been customer 3 years")?.kind).toBe("call-script");
    expect(parseHomeAssistantShortcut("renewal watch: Netflix renews on 18 May 2026")?.kind).toBe("renewal-watch");
    expect(parseHomeAssistantShortcut("complaint: Example Energy | unexplained $86 fee | remove the fee")?.kind).toBe("complaint");
    expect(parseHomeAssistantShortcut("check before send: I am furious. My card is 4111111111111111")?.kind).toBe("check-message");
    expect(parseHomeAssistantShortcut("travel day: Melbourne Airport | 2026-05-09 | flight at 8:30am, park car, take passport")?.kind).toBe("travel-day");
    expect(parseHomeAssistantShortcut("sort admin: pay rates, book car service, save passport number")?.kind).toBe("triage-admin");
  });

  it("does not parse ordinary short messages as home assistant shortcuts", () => {
    expect(parseHomeAssistantShortcut("hello")).toBeNull();
    expect(parseHomeAssistantShortcut("what is my weather today")).toBeNull();
    expect(parseHomeAssistantShortcut("pay bill tomorrow")).toBeNull();
  });
});
