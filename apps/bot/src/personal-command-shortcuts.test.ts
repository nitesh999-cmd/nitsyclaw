import { describe, expect, it } from "vitest";
import {
  parseAdminInboxActionShortcut,
  parseBuildAgentShortcut,
  parseAutonomousWorkShortcut,
  parseBugReportShortcut,
  parseCantDoGuardShortcut,
  parseCapabilityStatusShortcut,
  parseCommandContractShortcut,
  parseDailyStatusShortcut,
  parseDemoChecklistShortcut,
  parseDemoResultsShortcut,
  parseDemoStartShortcut,
  parseFeatureQueueShortcut,
  parseGmailStatusShortcut,
  parseHelpShortcut,
  parseLifeAdminCockpitShortcut,
  parsePendingFeatureDevelopmentShortcut,
  parseWhatsAppCanaryShortcut,
  parseWhatsAppControlPlaneShortcut,
  parseWhatsAppSelfTestShortcut,
  parseWhatsAppIncidentSummaryShortcut,
  parseHomeAssistantShortcut,
  parseQueuedIntegrationShortcut,
  parseLocalStatusShortcut,
  parseLocationStatusShortcut,
  parseLocationShortcut,
  parsePeopleMemoryShortcut,
  parseExpenseSearchShortcut,
  parseWeeklyAdminDigestShortcut,
} from "./personal-command-shortcuts.js";

describe("personal command shortcuts", () => {
  it("parses temporary travel/current-location messages", () => {
    expect(parseLocationShortcut("I'm in Brisbane until Monday")).toMatchObject({
      city: "Brisbane",
      region: "Queensland",
      country: "Australia",
      timezone: "Australia/Brisbane",
      expiresHint: "Monday",
    });
    expect(parseLocationShortcut("use Sydney for weather this week")).toMatchObject({
      city: "Sydney",
      region: "New South Wales",
      country: "Australia",
      timezone: "Australia/Sydney",
      expiresHint: "this week",
    });
  });

  it("parses combined travel and weather requests without swallowing the weather question", () => {
    expect(parseLocationShortcut("I'm in Sydney until tomorrow. What's the weather tomorrow?")).toMatchObject({
      city: "Sydney",
      region: "New South Wales",
      country: "Australia",
      timezone: "Australia/Sydney",
      expiresHint: "tomorrow",
      continueAfterSave: true,
    });
  });

  it("detects WhatsApp incident summary requests", () => {
    expect(parseWhatsAppIncidentSummaryShortcut("what went wrong")).toEqual({ kind: "whatsapp-incident-summary" });
    expect(parseWhatsAppIncidentSummaryShortcut("recent failures")).toEqual({ kind: "whatsapp-incident-summary" });
    expect(parseWhatsAppIncidentSummaryShortcut("normal question")).toBeNull();
  });

  it("parses a return-home location command", () => {
    expect(parseLocationShortcut("back in Melbourne now")).toMatchObject({
      city: "Melbourne",
      region: "Victoria",
      country: "Australia",
      timezone: "Australia/Melbourne",
      expiresHint: undefined,
    });
  });

  it("does not treat ordinary sentences as location commands", () => {
    expect(parseLocationShortcut("I'm in trouble with a client")).toBeNull();
    expect(parseLocationShortcut("weather today")).toBeNull();
  });

  it("parses current weather location status commands", () => {
    expect(parseLocationStatusShortcut("location status")).toEqual({ kind: "location-status" });
    expect(parseLocationStatusShortcut("where am I?")).toEqual({ kind: "location-status" });
    expect(parseLocationStatusShortcut("what location are you using")).toEqual({ kind: "location-status" });
  });

  it("parses structured people memory save and list commands", () => {
    expect(parsePeopleMemoryShortcut("people memory")).toEqual({ kind: "list" });
    expect(parsePeopleMemoryShortcut("person: Maya | neighbour | birthday: 5 May | channel: WhatsApp | last: school pickup | follow up: ask about Saturday")).toEqual({
      kind: "save",
      input: {
        name: "Maya",
        relationship: "neighbour",
        birthday: "5 May",
        preferredChannel: "WhatsApp",
        lastInteraction: "school pickup",
        followUp: "ask about Saturday",
      },
    });
  });

  it("parses feature queue/status commands", () => {
    expect(parseFeatureQueueShortcut("feature status")).toEqual({ limit: 5 });
    expect(parseFeatureQueueShortcut("show feature queue")).toEqual({ limit: 5 });
    expect(parseFeatureQueueShortcut("next moves")).toEqual({ limit: 5 });
    expect(parseFeatureQueueShortcut("what should we build next")).toEqual({ limit: 5 });
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

  it("detects help and capability status requests", () => {
    expect(parseHelpShortcut("what can you do")).toEqual({ kind: "help" });
    expect(parseHelpShortcut("commands")).toEqual({ kind: "help" });
    expect(parseHelpShortcut("how do I use this?")).toEqual({ kind: "help" });
    expect(parseHelpShortcut("weather tomorrow")).toBeNull();
  });

  it("detects ready/pending/setup status requests", () => {
    expect(parseCapabilityStatusShortcut("status")).toEqual({ kind: "capability-status" });
    expect(parseCapabilityStatusShortcut("pending items")).toEqual({ kind: "capability-status" });
    expect(parseCapabilityStatusShortcut("what needs setup?")).toEqual({ kind: "capability-status" });
    expect(parseCapabilityStatusShortcut("capability map")).toEqual({ kind: "capability-status" });
    expect(parseCapabilityStatusShortcut("what works and what needs setup")).toEqual({ kind: "capability-status" });
    expect(parseCapabilityStatusShortcut("weather tomorrow")).toBeNull();
  });

  it("detects Gmail connector status requests without queueing setup", () => {
    expect(parseGmailStatusShortcut("gmail status")).toEqual({ kind: "gmail-status" });
    expect(parseGmailStatusShortcut("email status")).toEqual({ kind: "gmail-status" });
    expect(parseGmailStatusShortcut("can you read Gmail?")).toEqual({ kind: "gmail-status" });
    expect(parseGmailStatusShortcut("connect Gmail")).toBeNull();
  });

  it("detects requests to develop all pending features without treating status as execution", () => {
    expect(parsePendingFeatureDevelopmentShortcut("build all pending features")).toEqual({
      kind: "pending-feature-development",
    });
    expect(parsePendingFeatureDevelopmentShortcut("develop the queued items")).toEqual({
      kind: "pending-feature-development",
    });
    expect(parsePendingFeatureDevelopmentShortcut("ship feature queue")).toEqual({
      kind: "pending-feature-development",
    });
    expect(parsePendingFeatureDevelopmentShortcut("pending items")).toBeNull();
    expect(parsePendingFeatureDevelopmentShortcut("what is pending")).toBeNull();
  });

  it("detects queued integration setup requests", () => {
    expect(parseQueuedIntegrationShortcut("connect Gmail so you can draft replies")).toMatchObject({
      toolName: "queue_email_connection_request",
      input: { provider: "gmail", requestedCapability: "draft" },
    });
    expect(parseQueuedIntegrationShortcut("set up Google Photos search for family pictures")).toMatchObject({
      toolName: "queue_google_photos_import_request",
    });
    expect(parseQueuedIntegrationShortcut("connect my bank feeds for expenses")).toMatchObject({
      toolName: "queue_bank_csv_import_request",
    });
    expect(parseQueuedIntegrationShortcut("can you set up Spotify suggested playlists?")).toMatchObject({
      toolName: "queue_spotify_music_request",
    });
    expect(parseQueuedIntegrationShortcut("connect Facebook birthdays")).toMatchObject({
      toolName: "queue_birthday_import_request",
    });
    expect(parseQueuedIntegrationShortcut("analyse this Instagram reel https://example.com/reel/1")).toMatchObject({
      toolName: "queue_social_video_analysis_request",
    });
    expect(parseQueuedIntegrationShortcut("draft sms to John saying I am late")).toMatchObject({
      toolName: "prepare_sms_draft",
      input: { recipient: "John", body: "I am late" },
    });
    expect(parseQueuedIntegrationShortcut("weather tomorrow")).toBeNull();
  });

  it("covers real spoken queued-integration phrases", () => {
    const examples: Array<[string, string]> = [
      ["connect Gmail and Outlook for email", "queue_email_connection_request"],
      ["can you read my mailbox", "queue_email_connection_request"],
      ["set up email sending after approval", "queue_email_connection_request"],
      ["browse my Google Drive files", "queue_storage_file_import_request"],
      ["connect OneDrive documents", "queue_storage_file_import_request"],
      ["import this Drive proposal", "queue_storage_file_import_request"],
      ["search Google Photos for car photos", "queue_google_photos_import_request"],
      ["add photo album search", "queue_google_photos_import_request"],
      ["sync my Spotify music taste", "queue_spotify_music_request"],
      ["create suggested playlist in Spotify", "queue_spotify_music_request"],
      ["connect bank statements", "queue_bank_csv_import_request"],
      ["set up bank feed transactions", "queue_bank_csv_import_request"],
      ["import card feed expenses", "queue_bank_csv_import_request"],
      ["add Facebook birthday messages", "queue_birthday_import_request"],
      ["import birthdays from contacts", "queue_birthday_import_request"],
      ["connect phone call logs", "queue_phone_call_request"],
      ["access SMS logs", "queue_phone_call_request"],
      ["set up phone/SMS", "queue_phone_call_request"],
      ["analyse this YouTube short https://example.com/shorts/1", "queue_social_video_analysis_request"],
      ["analyze TikTok video ideas", "queue_social_video_analysis_request"],
    ];

    for (const [text, toolName] of examples) {
      expect(parseQueuedIntegrationShortcut(text), text).toMatchObject({ toolName });
    }
  });

  it("detects WhatsApp command contract requests", () => {
    expect(parseCommandContractShortcut("command contract")).toEqual({ kind: "command-contract" });
    expect(parseCommandContractShortcut("how do you handle commands?")).toEqual({ kind: "command-contract" });
    expect(parseCommandContractShortcut("what happens when a command fails")).toEqual({ kind: "command-contract" });
    expect(parseCommandContractShortcut("weather tomorrow")).toBeNull();
  });

  it("detects can't-do guard and safety boundary requests", () => {
    expect(parseCantDoGuardShortcut("can't-do guard")).toEqual({ kind: "cant-do-guard" });
    expect(parseCantDoGuardShortcut("what can't you do?")).toEqual({ kind: "cant-do-guard" });
    expect(parseCantDoGuardShortcut("safety limits")).toEqual({ kind: "cant-do-guard" });
    expect(parseCantDoGuardShortcut("weather tomorrow")).toBeNull();
  });

  it("detects WhatsApp self-test requests", () => {
    expect(parseWhatsAppSelfTestShortcut("self test")).toEqual({ kind: "whatsapp-self-test" });
    expect(parseWhatsAppSelfTestShortcut("whatsapp health")).toEqual({ kind: "whatsapp-self-test" });
    expect(parseWhatsAppSelfTestShortcut("diagnose whatsapp")).toEqual({ kind: "whatsapp-self-test" });
    expect(parseWhatsAppSelfTestShortcut("weather tomorrow")).toBeNull();
  });

  it("detects explicit WhatsApp canary requests", () => {
    expect(parseWhatsAppCanaryShortcut("canary test")).toEqual({ kind: "whatsapp-canary", detail: false });
    expect(parseWhatsAppCanaryShortcut("whatsapp canary")).toEqual({ kind: "whatsapp-canary", detail: false });
    expect(parseWhatsAppCanaryShortcut("proof test")).toEqual({ kind: "whatsapp-canary", detail: false });
    expect(parseWhatsAppCanaryShortcut("live proof")).toEqual({ kind: "whatsapp-canary", detail: false });
    expect(parseWhatsAppCanaryShortcut("test delivery")).toEqual({ kind: "whatsapp-canary", detail: false });
    expect(parseWhatsAppCanaryShortcut("proof details")).toEqual({ kind: "whatsapp-canary", detail: true });
    expect(parseWhatsAppCanaryShortcut("weather tomorrow")).toBeNull();
  });

  it("detects demo checklist requests", () => {
    expect(parseDemoChecklistShortcut("demo checklist")).toEqual({ kind: "demo-checklist" });
    expect(parseDemoChecklistShortcut("demo help")).toEqual({ kind: "demo-checklist" });
    expect(parseDemoChecklistShortcut("what should I test?")).toEqual({ kind: "demo-checklist" });
    expect(parseDemoChecklistShortcut("run demo checklist")).toEqual({ kind: "demo-checklist" });
    expect(parseDemoChecklistShortcut("weather tomorrow")).toBeNull();
  });

  it("detects demo start requests", () => {
    expect(parseDemoStartShortcut("start demo")).toEqual({ kind: "demo-start", action: "start" });
    expect(parseDemoStartShortcut("new demo")).toEqual({ kind: "demo-start", action: "start" });
    expect(parseDemoStartShortcut("start validation")).toEqual({ kind: "demo-start", action: "start" });
    expect(parseDemoStartShortcut("demo reset")).toEqual({ kind: "demo-start", action: "reset" });
    expect(parseDemoStartShortcut("restart demo")).toEqual({ kind: "demo-start", action: "reset" });
    expect(parseDemoStartShortcut("weather tomorrow")).toBeNull();
  });

  it("detects demo results requests", () => {
    expect(parseDemoResultsShortcut("demo results")).toEqual({ kind: "demo-results" });
    expect(parseDemoResultsShortcut("validation report")).toEqual({ kind: "demo-results" });
    expect(parseDemoResultsShortcut("show demo results")).toEqual({ kind: "demo-results" });
    expect(parseDemoResultsShortcut("weather tomorrow")).toBeNull();
  });

  it("detects WhatsApp control plane requests", () => {
    expect(parseWhatsAppControlPlaneShortcut("control plane")).toEqual({ kind: "whatsapp-control-plane" });
    expect(parseWhatsAppControlPlaneShortcut("whatsapp control plane")).toEqual({ kind: "whatsapp-control-plane" });
    expect(parseWhatsAppControlPlaneShortcut("bot control")).toEqual({ kind: "whatsapp-control-plane" });
    expect(parseWhatsAppControlPlaneShortcut("weather tomorrow")).toBeNull();
  });

  it("detects safe local status shortcuts", () => {
    expect(parseLocalStatusShortcut("local status")).toEqual({ kind: "all" });
    expect(parseLocalStatusShortcut("files")).toEqual({ kind: "files" });
    expect(parseLocalStatusShortcut("pending reminders")).toEqual({ kind: "reminders" });
    expect(parseLocalStatusShortcut("expense summary")).toEqual({ kind: "expenses" });
    expect(parseLocalStatusShortcut("summary commands")).toEqual({ kind: "summaries" });
    expect(parseLocalStatusShortcut("email status")).toBeNull();
  });

  it("detects daily status shortcuts", () => {
    expect(parseDailyStatusShortcut("daily status")).toEqual({ kind: "daily-status" });
    expect(parseDailyStatusShortcut("today summary")).toEqual({ kind: "daily-status" });
    expect(parseDailyStatusShortcut("morning brief")).toEqual({ kind: "daily-status" });
    expect(parseDailyStatusShortcut("weather tomorrow")).toBeNull();
  });

  it("detects weekly admin digest and coming-week shortcuts", () => {
    expect(parseWeeklyAdminDigestShortcut("weekly admin digest")).toEqual({ kind: "weekly-admin-digest" });
    expect(parseWeeklyAdminDigestShortcut("what's coming up this week?")).toEqual({ kind: "weekly-admin-digest" });
    expect(parseWeeklyAdminDigestShortcut("show my admin inbox")).toEqual({ kind: "weekly-admin-digest" });
    expect(parseWeeklyAdminDigestShortcut("weather this week")).toBeNull();
  });

  it("detects life admin cockpit shortcuts", () => {
    expect(parseLifeAdminCockpitShortcut("life admin")).toEqual({ kind: "life-admin-cockpit" });
    expect(parseLifeAdminCockpitShortcut("what should I do now?")).toEqual({ kind: "life-admin-cockpit" });
    expect(parseLifeAdminCockpitShortcut("what needs my attention")).toEqual({ kind: "life-admin-cockpit" });
    expect(parseLifeAdminCockpitShortcut("weather now")).toBeNull();
  });

  it("detects admin inbox action shortcuts", () => {
    expect(parseAdminInboxActionShortcut("admin history")).toEqual({ action: "history" });
    expect(parseAdminInboxActionShortcut("show last admin actions")).toEqual({ action: "history" });
    expect(parseAdminInboxActionShortcut("admin done")).toEqual({ action: "done" });
    expect(parseAdminInboxActionShortcut("done inbox")).toEqual({ action: "done" });
    expect(parseAdminInboxActionShortcut("admin dismiss")).toEqual({ action: "dismiss" });
    expect(parseAdminInboxActionShortcut("clear life admin")).toEqual({ action: "dismiss" });
    expect(parseAdminInboxActionShortcut("admin snooze tomorrow 9am")).toEqual({
      action: "snooze",
      whenText: "tomorrow 9am",
    });
    expect(parseAdminInboxActionShortcut("reschedule inbox Friday 4pm")).toEqual({
      action: "reschedule",
      whenText: "Friday 4pm",
    });
    expect(parseAdminInboxActionShortcut("weather tomorrow")).toBeNull();
  });

  it("detects expense and receipt search shortcuts", () => {
    expect(parseExpenseSearchShortcut("find expense chemist")).toEqual({ query: "chemist" });
    expect(parseExpenseSearchShortcut("search receipts uber")).toEqual({ query: "uber" });
    expect(parseExpenseSearchShortcut("receipt search AGL")).toEqual({ query: "AGL" });
    expect(parseExpenseSearchShortcut("expense summary")).toBeNull();
  });

  it("detects autonomous safe-work questions", () => {
    expect(parseAutonomousWorkShortcut("what else can you do without me")).toEqual({ kind: "autonomous-work" });
    expect(parseAutonomousWorkShortcut("what needs my involvement?")).toEqual({ kind: "autonomous-work" });
    expect(parseAutonomousWorkShortcut("minimal effort")).toEqual({ kind: "autonomous-work" });
    expect(parseAutonomousWorkShortcut("send email to Maya")).toBeNull();
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
