import { describe, expect, it } from "vitest";
import {
  checkMessageBeforeSending,
  cleanMessyNote,
  comparePersonalOptions,
  createEmergencyCard,
  createHouseholdChoreSplit,
  createHabitPlan,
  createHomeInventory,
  createLeaveHomeChecklist,
  createMedicineList,
  createMoveChecklist,
  createPetCarePlan,
  createShoppingList,
  draftSchoolNote,
  draftWarmReply,
  extractBillSummary,
  extractActionItemsFromText,
  extractRenewalWatch,
  planCarTripPrep,
  planCleaningSprint,
  planGuestPrep,
  planHomeMaintenance,
  planLostItemSearch,
  planAppointmentPrep,
  planMealIdeas,
  planPackingList,
  planPasswordReset,
  planWeekend,
  planPhoneCallScript,
  planTravelDay,
  prepareBillDispute,
  prepareFirmComplaint,
  prepareDecisionMemo,
  prepareReturnPlan,
  prepareSymptomNote,
  splitBudget,
  suggestKidActivity,
  suggestGiftIdeas,
  trackWarranty,
  registerAllFeatures,
  reviewSubscriptions,
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

  it("extracts bill summary with amount, due date, and safe action", () => {
    const result = extractBillSummary({
      text: "AGL electricity bill $240.50 due 18 May 2026. Pay by BPAY.",
    });

    expect(result.provider).toBe("AGL electricity bill");
    expect(result.amount).toBe("$240.50");
    expect(result.dueDate).toBe("2026-05-18");
    expect(result.nextAction).toMatch(/review/i);
  });

  it("prepares a return or warranty plan without inventing policy details", () => {
    const result = prepareReturnPlan({
      item: "Kmart lamp",
      purchaseInfo: "bought yesterday",
      issue: "broken switch",
    });

    expect(result.summary).toContain("Kmart lamp");
    expect(result.steps).toEqual(expect.arrayContaining([expect.stringContaining("receipt")]));
    expect(result.message).toContain("broken switch");
  });

  it("reviews subscriptions and flags items worth checking", () => {
    const result = reviewSubscriptions({
      text: "Netflix $22 monthly. Gym $79 renews on 1 June 2026. Old app $9 unused.",
    });

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Netflix", amount: "$22", cadence: "monthly" }),
        expect.objectContaining({ name: "Gym", amount: "$79", reviewDate: "2026-06-01" }),
        expect.objectContaining({ name: "Old app", action: "cancel if unused" }),
      ]),
    );
  });

  it("splits household chores evenly", () => {
    const result = createHouseholdChoreSplit({
      people: ["Nitesh", "Sam"],
      chores: ["dishes", "bins", "vacuum"],
    });

    expect(result.assignments.Nitesh).toEqual(expect.arrayContaining(["dishes", "vacuum"]));
    expect(result.assignments.Sam).toEqual(["bins"]);
  });

  it("creates an emergency card while masking long phone numbers", () => {
    const result = createEmergencyCard({
      name: "Nitesh",
      phone: "0430008008",
      notes: ["asthma"],
      contacts: ["Mum 0400000000"],
    });

    expect(result.card).toContain("Nitesh");
    expect(result.card).toContain("********8008");
    expect(result.card).not.toContain("0430008008");
  });

  it("plans simple meal ideas from ingredients", () => {
    const result = planMealIdeas({
      ingredients: ["eggs", "rice", "spinach"],
      preference: "quick vegetarian",
    });

    expect(result.ideas.length).toBe(3);
    expect(result.shoppingGaps).toEqual(expect.arrayContaining(["pantry staples"]));
  });

  it("groups a shopping list into obvious aisles", () => {
    const result = createShoppingList({
      items: ["milk", "eggs", "bananas", "dish soap"],
    });

    expect(result.groups.dairy).toEqual(expect.arrayContaining(["milk", "eggs"]));
    expect(result.groups.produce).toEqual(["bananas"]);
    expect(result.groups.household).toEqual(["dish soap"]);
  });

  it("plans packing lists for short trips", () => {
    const result = planPackingList({
      destination: "Sydney",
      days: 2,
      commitments: ["laptop", "charger", "suit"],
    });

    expect(result.items).toEqual(expect.arrayContaining(["2 outfits", "laptop", "charger", "suit"]));
  });

  it("prepares appointment notes with questions and documents", () => {
    const result = planAppointmentPrep({
      provider: "GP",
      concern: "headaches for two weeks",
      goals: ["ask about tests"],
    });

    expect(result.opening).toContain("GP");
    expect(result.questions).toEqual(expect.arrayContaining([expect.stringContaining("tests")]));
    expect(result.bring).toEqual(expect.arrayContaining(["Medicare card or ID"]));
  });

  it("prepares a small decision memo with a next step", () => {
    const result = prepareDecisionMemo({
      decision: "keep old car or buy used car",
      facts: ["budget tight", "reliability matters"],
    });

    expect(result.memo).toContain("keep old car or buy used car");
    expect(result.nextStep).toMatch(/one missing fact/i);
  });

  it("creates a home inventory list for one area", () => {
    const result = createHomeInventory({
      area: "garage",
      items: ["drill", "ladder", "camping chairs"],
    });

    expect(result.title).toBe("Garage inventory");
    expect(result.items).toEqual(["drill", "ladder", "camping chairs"]);
  });

  it("plans home maintenance with safe first steps", () => {
    const result = planHomeMaintenance({
      item: "washing machine",
      issue: "leaking under sink",
      urgency: "urgent",
    });

    expect(result.summary).toContain("washing machine");
    expect(result.steps).toEqual(expect.arrayContaining([expect.stringContaining("Turn off")]));
  });

  it("suggests gift ideas inside a budget", () => {
    const result = suggestGiftIdeas({
      person: "Maya",
      budget: "$80",
      interests: ["gardening", "books"],
    });

    expect(result.ideas.length).toBe(3);
    expect(result.ideas[0]).toContain("Maya");
    expect(result.budget).toBe("$80");
  });

  it("plans a simple weekend without overbooking", () => {
    const result = planWeekend({
      location: "Melbourne",
      weather: "rainy",
      constraints: ["family friendly"],
    });

    expect(result.plan).toEqual(expect.arrayContaining([expect.stringContaining("indoor")]));
    expect(result.plan.length).toBeLessThanOrEqual(4);
  });

  it("splits a budget evenly and keeps cents stable", () => {
    const result = splitBudget({
      amount: "$120",
      people: ["Nitesh", "Sam", "Maya"],
      note: "dinner",
    });

    expect(result.totalCents).toBe(12000);
    expect(result.shares).toEqual([
      { person: "Nitesh", amount: "$40.00" },
      { person: "Sam", amount: "$40.00" },
      { person: "Maya", amount: "$40.00" },
    ]);
  });

  it("creates a tiny habit plan", () => {
    const result = createHabitPlan({
      habit: "walk 20 minutes",
      time: "7am",
      trigger: "after coffee",
    });

    expect(result.plan).toContain("walk 20 minutes");
    expect(result.steps).toEqual(expect.arrayContaining([expect.stringContaining("after coffee")]));
  });

  it("plans a lost item search from most likely places", () => {
    const result = planLostItemSearch({
      item: "passport",
      lastSeen: "drawer",
      places: ["car", "desk", "suitcase"],
    });

    expect(result.steps[0]).toContain("drawer");
    expect(result.steps).toEqual(expect.arrayContaining([expect.stringContaining("suitcase")]));
  });

  it("drafts a plain school absence note", () => {
    const result = draftSchoolNote({
      child: "Aarav",
      reason: "sick today",
      date: "2026-05-06",
    });

    expect(result.note).toContain("Aarav");
    expect(result.note).toContain("2026-05-06");
    expect(result.note).not.toMatch(/as an ai/i);
  });

  it("creates a pet care checklist", () => {
    const result = createPetCarePlan({
      pet: "Milo",
      routine: ["feed 7am", "walk 6pm"],
      dates: "Fri-Sun",
    });

    expect(result.title).toContain("Milo");
    expect(result.checklist).toEqual(expect.arrayContaining(["feed 7am", "walk 6pm"]));
  });

  it("plans password reset steps without collecting secrets", () => {
    const result = planPasswordReset({
      account: "Gmail",
      issue: "cannot login",
    });

    expect(result.steps).toEqual(expect.arrayContaining([expect.stringContaining("official")]));
    expect(result.warning).toMatch(/do not send/i);
  });

  it("creates a leave-home checklist from trip duration and risks", () => {
    const result = createLeaveHomeChecklist({
      duration: "overnight",
      risks: ["heater", "back door"],
    });

    expect(result.title).toContain("overnight");
    expect(result.items).toEqual(expect.arrayContaining([expect.stringContaining("Lock doors"), expect.stringContaining("heater")]));
  });

  it("plans car trip prep with passengers and needs", () => {
    const result = planCarTripPrep({
      destination: "Geelong",
      passengers: ["Maya"],
      needs: ["snacks", "pram"],
    });

    expect(result.title).toContain("Geelong");
    expect(result.checklist).toEqual(expect.arrayContaining([expect.stringContaining("fuel"), expect.stringContaining("snacks")]));
  });

  it("creates a medicine list with a safe medical warning", () => {
    const result = createMedicineList({
      person: "Nitesh",
      medicines: ["Ventolin 2 puffs", "Vitamin D"],
      notes: ["keep inhaler nearby"],
    });

    expect(result.card).toContain("Nitesh");
    expect(result.entries).toHaveLength(2);
    expect(result.warning).toMatch(/doctor|pharmacist/i);
  });

  it("prepares a symptom note without giving medical diagnosis", () => {
    const result = prepareSymptomNote({
      concern: "headache",
      duration: "2 weeks",
      symptoms: ["nausea", "light sensitivity"],
      questions: ["ask about tests"],
    });

    expect(result.summary).toContain("headache");
    expect(result.questions).toEqual(expect.arrayContaining([expect.stringContaining("tests")]));
    expect(result.warning).toMatch(/urgent|doctor/i);
  });

  it("prepares a bill dispute with evidence-first steps", () => {
    const result = prepareBillDispute({
      provider: "Example Energy",
      amount: "$86",
      issue: "unexplained fee",
    });

    expect(result.message).toContain("Example Energy");
    expect(result.message).toContain("$86");
    expect(result.steps).toEqual(expect.arrayContaining([expect.stringContaining("Gather")]));
  });

  it("plans guest prep for arrival and needs", () => {
    const result = planGuestPrep({
      guests: "Maya and family",
      arrival: "Saturday 6pm",
      needs: ["vegetarian dinner", "spare towels"],
    });

    expect(result.title).toContain("Maya and family");
    expect(result.checklist).toEqual(expect.arrayContaining([expect.stringContaining("vegetarian dinner")]));
  });

  it("suggests simple kid activities for the situation", () => {
    const result = suggestKidActivity({
      child: "Aarav",
      age: "8",
      time: "30 minutes",
      constraints: ["rainy"],
    });

    expect(result.activities.length).toBeLessThanOrEqual(3);
    expect(result.activities).toEqual(expect.arrayContaining([expect.stringContaining("indoor")]));
  });

  it("creates a short cleaning sprint plan", () => {
    const result = planCleaningSprint({
      area: "kitchen",
      minutes: 20,
      priorities: ["bench", "sink"],
    });

    expect(result.title).toContain("kitchen");
    expect(result.steps[0]).toContain("Set a 20 minute timer");
    expect(result.steps.length).toBeLessThanOrEqual(5);
  });

  it("creates a moving checklist without pretending to book anything", () => {
    const result = createMoveChecklist({
      from: "Point Cook",
      to: "Melbourne",
      date: "2026-06-01",
    });

    expect(result.title).toContain("Point Cook");
    expect(result.checklist).toEqual(expect.arrayContaining([expect.stringContaining("utilities")]));
  });

  it("tracks warranty details with receipt-first next steps", () => {
    const result = trackWarranty({
      item: "washing machine",
      purchaseDate: "2026-01-10",
      warranty: "2 years",
    });

    expect(result.summary).toContain("washing machine");
    expect(result.summary).toContain("2 years");
    expect(result.steps).toEqual(expect.arrayContaining([expect.stringContaining("receipt")]));
  });

  it("registers all forty home assistant tools", () => {
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
        "extract_bill_summary",
        "prepare_return_plan",
        "review_subscriptions",
        "create_household_chore_split",
        "create_emergency_card",
        "plan_meal_ideas",
        "create_shopping_list",
        "plan_packing_list",
        "plan_appointment_prep",
        "prepare_decision_memo",
        "create_home_inventory",
        "plan_home_maintenance",
        "suggest_gift_ideas",
        "plan_weekend",
        "split_budget",
        "create_habit_plan",
        "plan_lost_item_search",
        "draft_school_note",
        "create_pet_care_plan",
        "plan_password_reset",
        "create_leave_home_checklist",
        "plan_car_trip_prep",
        "create_medicine_list",
        "prepare_symptom_note",
        "prepare_bill_dispute",
        "plan_guest_prep",
        "suggest_kid_activity",
        "plan_cleaning_sprint",
        "create_move_checklist",
        "track_warranty",
      ]),
    );
  });
});
