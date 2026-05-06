import { describe, expect, it } from "vitest";
import {
  checkMessageBeforeSending,
  cleanMessyNote,
  comparePersonalOptions,
  draftWarmReply,
  extractActionItemsFromText,
  extractRenewalWatch,
  planPhoneCallScript,
  planTravelDay,
  prepareFirmComplaint,
  registerAllFeatures,
  triageLifeAdminNote,
} from "../src/features/index.js";

describe("home assistant tools", () => {
  it("extracts practical action items from messy home-admin text", () => {
    const result = extractActionItemsFromText({
      text: "Pay electricity bill by Friday. Call dentist tomorrow. Reply to Sarah about dinner.",
      now: new Date("2026-05-06T09:00:00+10:00"),
    });

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Pay electricity bill", kind: "pay", dueHint: "Friday" }),
        expect.objectContaining({ title: "Call dentist", kind: "call", dueHint: "tomorrow" }),
        expect.objectContaining({ title: "Reply to Sarah about dinner", kind: "reply" }),
      ]),
    );
  });

  it("triages notes into obvious next buckets", () => {
    const result = triageLifeAdminNote({
      text: "Need to pay rates, book car service, decide on health insurance, save passport number.",
    });

    expect(result.buckets.pay).toContain("pay rates");
    expect(result.buckets.book).toContain("book car service");
    expect(result.buckets.decide).toContain("decide on health insurance");
    expect(result.buckets.save).toContain("save passport number");
  });

  it("drafts a warm reply without sounding robotic", () => {
    const result = draftWarmReply({
      recipient: "Maya",
      situation: "She invited us for Sunday lunch but we cannot make it.",
      intent: "decline kindly and suggest next weekend",
    });

    expect(result.body).toContain("Maya");
    expect(result.body).toContain("Sunday lunch");
    expect(result.body).toContain("next weekend");
    expect(result.body).not.toMatch(/as an ai|hope this email finds you/i);
  });

  it("compares personal options with a clear recommendation", () => {
    const result = comparePersonalOptions({
      decision: "Which internet plan should I pick?",
      options: [
        { name: "Cheap plan", pros: ["low price"], cons: ["slow upload"] },
        { name: "Reliable plan", pros: ["stable", "better support"], cons: ["costs $12 more"] },
      ],
      priorities: ["reliability", "working from home"],
    });

    expect(result.recommended).toBe("Reliable plan");
    expect(result.reason).toMatch(/reliability|working from home/i);
  });

  it("prepares phone-call scripts with questions and fallback SMS", () => {
    const result = planPhoneCallScript({
      contact: "Energy retailer",
      goal: "Ask for a better rate before switching",
      facts: ["Been with them for 3 years", "Competitor is cheaper"],
    });

    expect(result.openingLine).toContain("better rate");
    expect(result.keyQuestions.length).toBeGreaterThanOrEqual(3);
    expect(result.fallbackSms).toContain("Energy retailer");
  });

  it("extracts renewal and cancellation watch items", () => {
    const result = extractRenewalWatch({
      text: "Netflix renews on 18 May 2026. Gym contract cancellation requires 30 days notice before 1 June 2026.",
    });

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Netflix", date: "2026-05-18", action: "review renewal" }),
        expect.objectContaining({ label: "Gym contract", date: "2026-06-01", action: "cancel or renegotiate" }),
      ]),
    );
  });

  it("prepares firm complaint messages with clear ask and deadline", () => {
    const result = prepareFirmComplaint({
      company: "Example Energy",
      issue: "The bill has an unexplained $86 fee",
      desiredOutcome: "remove the fee or explain it in writing",
      deadline: "Friday",
    });

    expect(result.message).toContain("Example Energy");
    expect(result.message).toContain("$86 fee");
    expect(result.message).toContain("Friday");
    expect(result.message).not.toMatch(/furious|threaten/i);
  });

  it("cleans messy notes into a short readable version", () => {
    const result = cleanMessyNote({
      text: "  remember!!! car rego maybe due soon?? call vicroads    also ask about concession   ",
    });

    expect(result.cleaned).toBe("Car rego may be due soon. Call Vicroads. Ask about concession.");
  });

  it("checks outgoing messages for risky tone and sensitive details", () => {
    const result = checkMessageBeforeSending({
      text: "I am furious. My card is 4111111111111111. Fix this now or else.",
    });

    expect(result.flags).toEqual(expect.arrayContaining(["too_heated", "contains_sensitive_number"]));
    expect(result.saferText).not.toContain("4111111111111111");
  });

  it("plans a travel day checklist for normal humans", () => {
    const result = planTravelDay({
      destination: "Melbourne Airport",
      date: "2026-05-09",
      commitments: ["flight at 8:30am", "park car", "take passport"],
    });

    expect(result.checklist).toEqual(
      expect.arrayContaining([
        expect.stringContaining("passport"),
        expect.stringContaining("flight at 8:30am"),
        expect.stringContaining("parking"),
      ]),
    );
  });

  it("registers all ten home assistant tools", () => {
    const registry = registerAllFeatures({ surface: "whatsapp" });
    const names = registry.all().map((tool) => tool.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "extract_action_items",
        "triage_life_admin_note",
        "draft_warm_reply",
        "compare_personal_options",
        "plan_phone_call_script",
        "extract_renewal_watch",
        "prepare_firm_complaint",
        "clean_messy_note",
        "check_message_before_sending",
        "plan_travel_day",
      ]),
    );
  });
});
