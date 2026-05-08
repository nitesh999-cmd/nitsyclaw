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
    expect(parseFeatureQueueShortcut("is there any pending features you're still about to add?")).toEqual({ limit: 5 });
    expect(parseFeatureQueueShortcut("what is still pending from the queue")).toEqual({ limit: 5 });
    expect(parseFeatureQueueShortcut("how's the weather tomorrow and any pending features?")).toBeNull();
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

  it("parses forty home assistant shortcuts", () => {
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
    expect(parseHomeAssistantShortcut("bill summary: AGL bill $240 due 18 May 2026")?.kind).toBe("bill-summary");
    expect(parseHomeAssistantShortcut("return plan: Kmart lamp | bought yesterday | broken switch")?.kind).toBe("return-plan");
    expect(parseHomeAssistantShortcut("subscription check: Netflix $22 monthly. Gym $79 renews 1 June 2026")?.kind).toBe("subscription-check");
    expect(parseHomeAssistantShortcut("chore split: Nitesh, Sam | dishes, bins, vacuum")?.kind).toBe("chore-split");
    expect(parseHomeAssistantShortcut("emergency card: Nitesh | 0430008008 | asthma | Mum 0400000000")?.kind).toBe("emergency-card");
    expect(parseHomeAssistantShortcut("meal ideas: eggs, rice, spinach | vegetarian")?.kind).toBe("meal-ideas");
    expect(parseHomeAssistantShortcut("shopping list: milk, eggs, bananas, dish soap")?.kind).toBe("shopping-list");
    expect(parseHomeAssistantShortcut("pack list: Sydney | 2 days | laptop, charger, suit")?.kind).toBe("pack-list");
    expect(parseHomeAssistantShortcut("appointment prep: GP | headaches for two weeks | ask about tests")?.kind).toBe("appointment-prep");
    expect(parseHomeAssistantShortcut("decision memo: keep old car or buy used car | budget tight | reliability matters")?.kind).toBe("decision-memo");
    expect(parseHomeAssistantShortcut("home inventory: garage | drill, ladder, camping chairs")?.kind).toBe("home-inventory");
    expect(parseHomeAssistantShortcut("maintenance plan: washing machine | leaking under sink | urgent")?.kind).toBe("maintenance-plan");
    expect(parseHomeAssistantShortcut("gift ideas: Maya | $80 | gardening, books")?.kind).toBe("gift-ideas");
    expect(parseHomeAssistantShortcut("weekend plan: Melbourne | rainy | family friendly")?.kind).toBe("weekend-plan");
    expect(parseHomeAssistantShortcut("budget split: $120 | Nitesh, Sam, Maya | dinner")?.kind).toBe("budget-split");
    expect(parseHomeAssistantShortcut("habit plan: walk 20 minutes | 7am | after coffee")?.kind).toBe("habit-plan");
    expect(parseHomeAssistantShortcut("lost item: passport | last seen in drawer | car, desk, suitcase")?.kind).toBe("lost-item");
    expect(parseHomeAssistantShortcut("school note: Aarav | sick today | 2026-05-06")?.kind).toBe("school-note");
    expect(parseHomeAssistantShortcut("pet care: Milo | feed 7am, walk 6pm | Fri-Sun")?.kind).toBe("pet-care");
    expect(parseHomeAssistantShortcut("password reset plan: Gmail | cannot login")?.kind).toBe("password-reset-plan");
    expect(parseHomeAssistantShortcut("leave home checklist: overnight | heater, back door")?.kind).toBe("leave-home-checklist");
    expect(parseHomeAssistantShortcut("car trip prep: Geelong | Maya | snacks, pram")?.kind).toBe("car-trip-prep");
    expect(parseHomeAssistantShortcut("medicine list: Nitesh | Ventolin 2 puffs, Vitamin D | keep inhaler nearby")?.kind).toBe("medicine-list");
    expect(parseHomeAssistantShortcut("symptom note: headache | 2 weeks | nausea, light sensitivity | ask about tests")?.kind).toBe("symptom-note");
    expect(parseHomeAssistantShortcut("bill dispute: Example Energy | $86 | unexplained fee")?.kind).toBe("bill-dispute");
    expect(parseHomeAssistantShortcut("guest prep: Maya and family | Saturday 6pm | vegetarian dinner, spare towels")?.kind).toBe("guest-prep");
    expect(parseHomeAssistantShortcut("kid activity: Aarav | 8 | 30 minutes | rainy")?.kind).toBe("kid-activity");
    expect(parseHomeAssistantShortcut("cleaning plan: kitchen | 20 | bench, sink")?.kind).toBe("cleaning-plan");
    expect(parseHomeAssistantShortcut("move checklist: Point Cook | Melbourne | 2026-06-01")?.kind).toBe("move-checklist");
    expect(parseHomeAssistantShortcut("warranty tracker: washing machine | 2026-01-10 | 2 years")?.kind).toBe("warranty-tracker");
  });

  it("does not parse ordinary short messages as home assistant shortcuts", () => {
    expect(parseHomeAssistantShortcut("hello")).toBeNull();
    expect(parseHomeAssistantShortcut("what is my weather today")).toBeNull();
    expect(parseHomeAssistantShortcut("pay bill tomorrow")).toBeNull();
  });
});
