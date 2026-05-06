import { describe, expect, it } from "vitest";
import {
  capabilityBoundarySummary,
  createDataInventoryMap,
  createFirstDayWizard,
  createPeopleMemoryCard,
  draftConsentReceipt,
  extractWaitingOnItems,
  labelActionRisk,
  planPrivateMode,
  planTravelAwareMode,
  registerAllFeatures,
  reviewMemoryCandidate,
} from "../src/features/index.js";

describe("personal OS batch 1 tools", () => {
  it("creates a first-day wizard with the first three starter jobs", () => {
    const result = createFirstDayWizard({
      homeLocation: "Melbourne",
      timezone: "Australia/Melbourne",
      people: ["Sam", "Mum"],
      jobs: ["weather uses my real location", "remember school dates", "track bills", "later item"],
    });

    expect(result.captured.homeLocation).toBe("Melbourne");
    expect(result.firstThreeJobs).toEqual(["weather uses my real location", "remember school dates", "track bills"]);
    expect(result.setupChecklist).toContain("Keep integrations read-only until trust is proven.");
  });

  it("plans travel mode without overwriting home location", () => {
    const result = planTravelAwareMode({
      city: "Auckland",
      country: "New Zealand",
      timezone: "Pacific/Auckland",
      ends: "Sunday night",
    });

    expect(result.currentLocation).toBe("Auckland, New Zealand");
    expect(result.safeguards).toEqual(expect.arrayContaining([
      "Do not overwrite home location unless the user explicitly says to save it as home.",
    ]));
    expect(result.weatherInstruction).toContain("Auckland");
  });

  it("creates a people memory card with safe defaults", () => {
    const result = createPeopleMemoryCard({
      name: "maya",
      relationship: "neighbour",
      preferredChannel: "WhatsApp",
      followUp: "ask about school pickup",
    });

    expect(result.fields.name).toBe("Maya");
    expect(result.fields.preferredChannel).toBe("WhatsApp");
    expect(result.nextAction).toContain("school pickup");
  });

  it("extracts waiting-on items from messy text", () => {
    const result = extractWaitingOnItems({
      text: "Waiting for plumber quote by Friday. Need to chase bank reply. Buy milk.",
      defaultCadence: "check in 2 days",
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ dueHint: "by Friday", cadence: "check in 2 days" });
  });

  it("summarises capability boundaries without overpromising", () => {
    const result = capabilityBoundarySummary({ area: "phone" });

    expect(result.canDoNow).toContain("draft SMS copy");
    expect(result.blocked).toContain("silent phone calls or SMS sends");
    expect(result.approvalRequired).toContain("any outbound message or call");
  });

  it("creates a data inventory map with encrypted personal data controls", () => {
    const result = createDataInventoryMap();

    expect(result.dataTypes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Messages", encrypted: true, userControl: "export/delete" }),
      expect.objectContaining({ name: "Audit log", encrypted: false, userControl: "redacted export/delete" }),
    ]));
  });

  it("labels risky outbound actions as high risk", () => {
    const result = labelActionRisk({
      action: "send SMS to accountant",
      sendsExternally: true,
      readsPrivateData: true,
      moneyOrLegal: true,
    });

    expect(result.level).toBe("high");
    expect(result.requiredConfirmation).toBe("explicit yes with action details");
    expect(result.safeDefault).toContain("queue a request");
  });

  it("drafts consent receipts with revoke checks", () => {
    const result = draftConsentReceipt({
      permission: "read Gmail unread messages",
      accountOrProvider: "Google",
      scope: "read-only Gmail metadata",
      reason: "morning brief",
    });

    expect(result.summary).toContain("Google");
    expect(result.fields.scope).toBe("read-only Gmail metadata");
    expect(result.checks).toContain("Allow revoke/disconnect from settings.");
  });

  it("plans private mode behavior without pretending provider logs disappear", () => {
    const result = planPrivateMode({ surface: "whatsapp", duration: "10 minutes" });

    expect(result.behavior).toContain("Do not include this turn in future cross-surface history.");
    expect(result.limitations).toEqual(expect.arrayContaining([
      "Provider/API logs outside the app may still exist.",
    ]));
    expect(result.exitPhrase).toBe("private mode off");
  });

  it("rejects secrets as memory candidates", () => {
    const result = reviewMemoryCandidate({
      fact: "My password is hunter2",
      source: "WhatsApp",
    });

    expect(result.recommendation).toBe("do_not_save");
    expect(result.reasons[0]).toContain("secret");
  });

  it("registers all 10 batch tools", () => {
    const registry = registerAllFeatures({ surface: "dashboard" });

    for (const name of [
      "create_first_day_wizard",
      "plan_travel_aware_mode",
      "create_people_memory_card",
      "extract_waiting_on_items",
      "capability_boundary_summary",
      "create_data_inventory_map",
      "label_action_risk",
      "draft_consent_receipt",
      "plan_private_mode",
      "review_memory_candidate",
    ]) {
      expect(registry.get(name), name).toBeTruthy();
    }
  });
});
