// Feature 21: Small home-use assistant tools for everyday life admin.

import { z } from "zod";
import type { ToolRegistry } from "../agent/tools.js";

type ActionKind = "pay" | "call" | "reply" | "book" | "decide" | "save" | "do";

export interface ExtractActionItemsInput {
  text: string;
  now?: Date;
}

export interface ActionItem {
  title: string;
  kind: ActionKind;
  dueHint?: string;
  priority: "high" | "medium" | "low";
}

export interface TriageLifeAdminNoteInput {
  text: string;
}

export interface DraftWarmReplyInput {
  recipient?: string;
  situation: string;
  intent: string;
  tone?: "warm" | "brief" | "firm" | "friendly";
}

export interface ComparePersonalOptionsInput {
  decision: string;
  options: Array<{
    name: string;
    pros?: string[];
    cons?: string[];
  }>;
  priorities?: string[];
}

export interface PlanPhoneCallScriptInput {
  contact: string;
  goal: string;
  facts?: string[];
}

export interface ExtractRenewalWatchInput {
  text: string;
}

export interface PrepareFirmComplaintInput {
  company: string;
  issue: string;
  desiredOutcome: string;
  deadline?: string;
}

export interface CleanMessyNoteInput {
  text: string;
}

export interface CheckMessageBeforeSendingInput {
  text: string;
}

export interface PlanTravelDayInput {
  destination: string;
  date?: string;
  commitments?: string[];
}

export interface ExtractBillSummaryInput {
  text: string;
}

export interface PrepareReturnPlanInput {
  item: string;
  purchaseInfo?: string;
  issue: string;
}

export interface ReviewSubscriptionsInput {
  text: string;
}

export interface CreateHouseholdChoreSplitInput {
  people: string[];
  chores: string[];
}

export interface CreateEmergencyCardInput {
  name: string;
  phone?: string;
  notes?: string[];
  contacts?: string[];
}

export interface PlanMealIdeasInput {
  ingredients: string[];
  preference?: string;
}

export interface CreateShoppingListInput {
  items: string[];
}

export interface PlanPackingListInput {
  destination: string;
  days?: number;
  commitments?: string[];
}

export interface PlanAppointmentPrepInput {
  provider: string;
  concern: string;
  goals?: string[];
}

export interface PrepareDecisionMemoInput {
  decision: string;
  facts?: string[];
}

export interface CreateHomeInventoryInput {
  area: string;
  items: string[];
}

export interface PlanHomeMaintenanceInput {
  item: string;
  issue: string;
  urgency?: string;
}

export interface SuggestGiftIdeasInput {
  person: string;
  budget?: string;
  interests?: string[];
}

export interface PlanWeekendInput {
  location: string;
  weather?: string;
  constraints?: string[];
}

export interface SplitBudgetInput {
  amount: string;
  people: string[];
  note?: string;
}

export interface CreateHabitPlanInput {
  habit: string;
  time?: string;
  trigger?: string;
}

export interface PlanLostItemSearchInput {
  item: string;
  lastSeen?: string;
  places?: string[];
}

export interface DraftSchoolNoteInput {
  child: string;
  reason: string;
  date?: string;
}

export interface CreatePetCarePlanInput {
  pet: string;
  routine: string[];
  dates?: string;
}

export interface PlanPasswordResetInput {
  account: string;
  issue?: string;
}

export interface CreateLeaveHomeChecklistInput {
  duration: string;
  risks?: string[];
}

export interface PlanCarTripPrepInput {
  destination: string;
  passengers?: string[];
  needs?: string[];
}

export interface CreateMedicineListInput {
  person: string;
  medicines: string[];
  notes?: string[];
}

export interface PrepareSymptomNoteInput {
  concern: string;
  duration?: string;
  symptoms?: string[];
  questions?: string[];
}

export interface PrepareBillDisputeInput {
  provider: string;
  amount?: string;
  issue: string;
}

export interface PlanGuestPrepInput {
  guests: string;
  arrival?: string;
  needs?: string[];
}

export interface SuggestKidActivityInput {
  child: string;
  age?: string;
  time?: string;
  constraints?: string[];
}

export interface PlanCleaningSprintInput {
  area: string;
  minutes?: number;
  priorities?: string[];
}

export interface CreateMoveChecklistInput {
  from: string;
  to: string;
  date?: string;
}

export interface TrackWarrantyInput {
  item: string;
  purchaseDate?: string;
  warranty?: string;
}

const MONTHS: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripTrailingDue(text: string): { title: string; dueHint?: string } {
  const due = text.match(/\b(?:by|before|on)\s+([A-Za-z]+|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\.?$/i);
  if (due) {
    return {
      title: cleanText(text.slice(0, due.index).replace(/[.?!]+$/, "")),
      dueHint: due[1],
    };
  }
  const simple = text.match(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\.?$/i);
  if (simple) {
    return {
      title: cleanText(text.slice(0, simple.index).replace(/[.?!]+$/, "")),
      dueHint: simple[1],
    };
  }
  return { title: cleanText(text.replace(/[.?!]+$/, "")) };
}

function kindFor(title: string): ActionKind {
  const lower = title.toLowerCase();
  if (/^pay\b|\bbill\b|\binvoice\b/.test(lower)) return "pay";
  if (/^call\b|\bphone\b/.test(lower)) return "call";
  if (/^reply\b|\brespond\b|\bmessage\b/.test(lower)) return "reply";
  if (/^book\b|\bschedule\b|\bappointment\b/.test(lower)) return "book";
  if (/^decide\b|\bchoose\b|\bpick\b|\bcompare\b/.test(lower)) return "decide";
  if (/^save\b|\bremember\b|\bpassport\b|\bnote\b/.test(lower)) return "save";
  return "do";
}

function priorityFor(kind: ActionKind, dueHint?: string): ActionItem["priority"] {
  if (kind === "pay" || /today|tomorrow/i.test(dueHint ?? "")) return "high";
  if (kind === "call" || kind === "book" || kind === "decide") return "medium";
  return "low";
}

function sentenceCase(text: string): string {
  const cleaned = cleanText(text);
  if (!cleaned) return cleaned;
  return `${cleaned[0]?.toUpperCase() ?? ""}${cleaned.slice(1)}`;
}

function parseDate(text: string): string | undefined {
  const match = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/);
  if (!match) return undefined;
  const day = Number(match[1]);
  const month = MONTHS[(match[2] ?? "").toLowerCase()];
  const year = Number(match[3]);
  if (!month || !Number.isInteger(day) || !Number.isInteger(year)) return undefined;
  return `${year}-${month}-${String(day).padStart(2, "0")}`;
}

function redactLongNumbers(text: string): string {
  return text.replace(/\b\d{10,}\b/g, (value) => `********${value.slice(-4)}`);
}

function parseMoneyToCents(value: string): number | undefined {
  const match = cleanText(value).match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
  if (!match) return undefined;
  return Math.round(Number(match[1]) * 100);
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function extractActionItemsFromText(input: ExtractActionItemsInput): { items: ActionItem[] } {
  const fragments = cleanText(input.text)
    .split(/(?:[.;\n]+|\s+and\s+)/i)
    .map((part) => cleanText(part))
    .filter(Boolean);

  const items = fragments
    .filter((part) => /\b(pay|call|reply|respond|book|decide|choose|save|remember|send|email|message)\b/i.test(part))
    .map((part) => {
      const { title, dueHint } = stripTrailingDue(part);
      const normalizedTitle = sentenceCase(title.replace(/^need to\s+/i, ""));
      const kind = kindFor(normalizedTitle);
      return {
        title: normalizedTitle,
        kind,
        dueHint,
        priority: priorityFor(kind, dueHint),
      };
    });

  return { items };
}

export function triageLifeAdminNote(input: TriageLifeAdminNoteInput): {
  buckets: Record<"pay" | "reply" | "book" | "decide" | "save" | "other", string[]>;
} {
  const buckets = {
    pay: [] as string[],
    reply: [] as string[],
    book: [] as string[],
    decide: [] as string[],
    save: [] as string[],
    other: [] as string[],
  };
  const parts = cleanText(input.text)
    .replace(/^need to\s+/i, "")
    .split(/[,.;\n]+|\s+and\s+/i)
    .map((part) => cleanText(part.replace(/^need to\s+/i, "")).toLowerCase())
    .filter(Boolean);

  for (const part of parts) {
    if (/^pay\b|\bbill\b|\binvoice\b/.test(part)) buckets.pay.push(part);
    else if (/^reply\b|^respond\b|^message\b|^email\b/.test(part)) buckets.reply.push(part);
    else if (/^book\b|^schedule\b|\bappointment\b/.test(part)) buckets.book.push(part);
    else if (/^decide\b|^choose\b|^compare\b|^pick\b/.test(part)) buckets.decide.push(part);
    else if (/^save\b|^remember\b|passport|licence|license/.test(part)) buckets.save.push(part);
    else buckets.other.push(part);
  }

  return { buckets };
}

export function draftWarmReply(input: DraftWarmReplyInput): { body: string; tone: string } {
  const recipient = input.recipient ? `${cleanText(input.recipient)}, ` : "";
  const situation = cleanText(input.situation).replace(/\.$/, "");
  const intent = cleanText(input.intent).replace(/\.$/, "");
  const body = `Hi ${recipient}thanks for thinking of us. ${sentenceCase(situation)}. I wanted to ${intent}.`;
  return {
    body: body.replace(/\s+/g, " ").trim(),
    tone: input.tone ?? "warm",
  };
}

export function comparePersonalOptions(input: ComparePersonalOptionsInput): {
  recommended: string;
  reason: string;
  scores: Array<{ name: string; score: number }>;
} {
  const priorities = (input.priorities ?? []).map((p) => p.toLowerCase());
  const scores = input.options.map((option) => {
    const haystack = [option.name, ...(option.pros ?? []), ...(option.cons ?? [])].join(" ").toLowerCase();
    const pros = (option.pros ?? []).join(" ").toLowerCase();
    const cons = (option.cons ?? []).join(" ").toLowerCase();
    let score = (option.pros?.length ?? 0) * 2 - (option.cons?.length ?? 0);
    for (const priority of priorities) {
      const reliabilityMatch =
        priority.includes("reliab") && /\b(stable|support|reliable|uptime|consistent)\b/.test(haystack);
      const homeWorkMatch =
        priority.includes("working from home") && /\b(stable|support|upload|internet|reliable)\b/.test(haystack);
      if (pros.includes(priority) || reliabilityMatch || homeWorkMatch) score += 4;
      if (cons.includes(priority)) score -= 4;
    }
    return { name: option.name, score };
  });
  const recommended = [...scores].sort((a, b) => b.score - a.score)[0]?.name ?? input.options[0]?.name ?? "";
  return {
    recommended,
    reason: priorities.length
      ? `${recommended} best matches: ${priorities.join(", ")}.`
      : `${recommended} has the strongest balance of upside and downside.`,
    scores,
  };
}

export function planPhoneCallScript(input: PlanPhoneCallScriptInput): {
  openingLine: string;
  keyQuestions: string[];
  fallbackSms: string;
} {
  const goal = cleanText(input.goal);
  const facts = input.facts?.map(cleanText).filter(Boolean) ?? [];
  return {
    openingLine: `Hi, I am calling to ${goal}.`,
    keyQuestions: [
      "What is the best option you can offer me today?",
      "Are there any fees, lock-ins, or conditions I should know about?",
      "Can you send the details in writing before I decide?",
      ...facts.map((fact) => `Does this change the answer: ${fact}?`),
    ],
    fallbackSms: `Hi ${cleanText(input.contact)}, I wanted to ${goal}. Please send the best option and any conditions in writing.`,
  };
}

export function extractRenewalWatch(input: ExtractRenewalWatchInput): {
  items: Array<{ label: string; date?: string; action: "review renewal" | "cancel or renegotiate" }>;
} {
  const sentences = cleanText(input.text)
    .split(/[.;\n]+/)
    .map(cleanText)
    .filter(Boolean);
  const items: Array<{ label: string; date?: string; action: "review renewal" | "cancel or renegotiate" }> = [];
  for (const sentence of sentences) {
    const date = parseDate(sentence);
    if (!date) continue;
    const renewal = sentence.match(/^([A-Z][A-Za-z0-9 &'/-]{1,40})\s+renews?\b/);
    if (renewal) {
      items.push({ label: cleanText(renewal[1] ?? ""), date, action: "review renewal" });
      continue;
    }
    const cancellation = sentence.match(/^([A-Z][A-Za-z0-9 &'/-]{1,40}?)\s+cancellation\b/i);
    if (cancellation) {
      items.push({ label: sentenceCase(cancellation[1] ?? ""), date, action: "cancel or renegotiate" });
    }
  }
  return { items };
}

export function prepareFirmComplaint(input: PrepareFirmComplaintInput): { message: string } {
  const deadline = input.deadline ? ` Please respond by ${cleanText(input.deadline)}.` : "";
  return {
    message:
      `Hi ${cleanText(input.company)}, I need help resolving this issue: ${cleanText(input.issue)}. ` +
      `Please ${cleanText(input.desiredOutcome)}.${deadline} I am happy to provide more details if needed.`,
  };
}

export function cleanMessyNote(input: CleanMessyNoteInput): { cleaned: string } {
  let text = input.text
    .replace(/[!?]+/g, ".")
    .replace(/\bremember\b/gi, "")
    .replace(/\bmaybe\b/gi, "may be")
    .replace(/\s+also\s+/gi, ". ")
    .replace(/\s+(call|ask|book|pay|reply|decide|save)\s+/gi, ". $1 ")
    .replace(/\.+/g, ".")
    .trim();

  const sentences = text
    .split(".")
    .map((part) => cleanText(part))
    .filter(Boolean)
    .map((part) => sentenceCase(part).replace(/\bvicroads\b/i, "Vicroads"));

  text = sentences.join(". ");
  return { cleaned: text ? `${text}.` : "" };
}

export function checkMessageBeforeSending(input: CheckMessageBeforeSendingInput): {
  flags: Array<"too_heated" | "contains_sensitive_number" | "too_long">;
  saferText: string;
} {
  const flags: Array<"too_heated" | "contains_sensitive_number" | "too_long"> = [];
  const text = cleanText(input.text);
  if (/\b(furious|fix this now|or else|idiot|stupid|useless)\b/i.test(text)) flags.push("too_heated");
  if (/\b\d{10,}\b/.test(text)) flags.push("contains_sensitive_number");
  if (text.length > 900) flags.push("too_long");
  const calmer = text
    .replace(/\bI am furious\.?\s*/i, "")
    .replace(/\bFix this now or else\.?/i, "Please help me resolve this.");
  return {
    flags,
    saferText: redactLongNumbers(cleanText(calmer)),
  };
}

export function planTravelDay(input: PlanTravelDayInput): {
  title: string;
  checklist: string[];
} {
  const commitments = input.commitments?.map(cleanText).filter(Boolean) ?? [];
  const checklist = [
    `Confirm travel time to ${cleanText(input.destination)}${input.date ? ` for ${input.date}` : ""}.`,
    "Pack wallet, keys, charger, and any required ID.",
    ...commitments.map((commitment) =>
      /park/i.test(commitment) ? "Confirm parking plan." : `Remember: ${commitment}.`,
    ),
  ];
  if (commitments.some((item) => /passport/i.test(item))) checklist.unshift("Pack passport.");
  return {
    title: `Travel day for ${cleanText(input.destination)}`,
    checklist: Array.from(new Set(checklist)),
  };
}

export function extractBillSummary(input: ExtractBillSummaryInput): {
  provider: string;
  amount?: string;
  dueDate?: string;
  reference?: string;
  suggestedReminder?: string;
  nextAction: string;
} {
  const text = cleanText(input.text);
  const amount = text.match(/(?:AUD\s*)?\$\s?\d+(?:\.\d{2})?/i)?.[0]?.replace(/\s+/g, "");
  const dueDate = parseDate(text);
  const reference = extractBillReference(text);
  const providerSource = amount ? text.slice(0, text.indexOf(amount)).trim() : text.split(/\bdue\b/i)[0] ?? text;
  const provider = sentenceCase(providerSource.replace(/[.:,-]+$/, "") || "Bill");
  const due = dueDate ? ` before ${dueDate}` : "";
  const suggestedReminder = dueDate ? `remind me to pay ${provider} on ${dateBeforeIso(dueDate)}` : undefined;
  return {
    provider,
    amount,
    dueDate,
    reference,
    suggestedReminder,
    nextAction: `Review the bill details${due}, then pay through the official provider app or saved payment method.`,
  };
}

function extractBillReference(text: string): string | undefined {
  const match = text.match(/\b(?:bpay reference|bpay ref|account number|account no|reference|ref|account)\s*[:#]?\s*([A-Z0-9-]{4,24})\b/i);
  return match?.[1]?.replace(/[.,;:]+$/g, "");
}

function dateBeforeIso(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function prepareReturnPlan(input: PrepareReturnPlanInput): {
  summary: string;
  steps: string[];
  message: string;
} {
  const item = cleanText(input.item);
  const issue = cleanText(input.issue);
  const purchaseInfo = input.purchaseInfo ? cleanText(input.purchaseInfo) : "purchase details not provided";
  return {
    summary: `${item}: ${issue} (${purchaseInfo}).`,
    steps: [
      "Find the receipt or bank transaction.",
      "Take clear photos of the item and fault.",
      "Check the store return or warranty page before travelling.",
      "Ask for repair, replacement, or refund in writing.",
    ],
    message: `Hi, I bought ${item} (${purchaseInfo}) and the issue is: ${issue}. Can you please confirm the return, refund, or warranty options in writing?`,
  };
}

export function reviewSubscriptions(input: ReviewSubscriptionsInput): {
  items: Array<{ name: string; amount?: string; cadence?: string; reviewDate?: string; action: string }>;
} {
  const sentences = cleanText(input.text).split(/[.;\n]+/).map(cleanText).filter(Boolean);
  const items = sentences.map((sentence) => {
    const amount = sentence.match(/\$\s?\d+(?:\.\d{2})?/i)?.[0]?.replace(/\s+/g, "");
    const cadence = sentence.match(/\b(monthly|weekly|yearly|annually|annual)\b/i)?.[1]?.toLowerCase();
    const reviewDate = parseDate(sentence);
    const name = sentence
      .replace(/\$\s?\d+(?:\.\d{2})?/i, "")
      .replace(/\b(monthly|weekly|yearly|annually|annual)\b/gi, "")
      .replace(/\brenews?\s+(?:on\s+)?\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/i, "")
      .replace(/\bunused\b/i, "")
      .trim()
      .replace(/[.:,-]+$/, "");
    const action = /unused|not used|old app/i.test(sentence)
      ? "cancel if unused"
      : reviewDate
        ? "review before renewal"
        : "keep only if still useful";
    return { name: sentenceCase(name || "Subscription"), amount, cadence, reviewDate, action };
  });
  return { items };
}

export function createHouseholdChoreSplit(input: CreateHouseholdChoreSplitInput): {
  assignments: Record<string, string[]>;
} {
  const people = input.people.map(cleanText).filter(Boolean);
  const chores = input.chores.map(cleanText).filter(Boolean);
  const assignments = Object.fromEntries(people.map((person) => [person, [] as string[]]));
  if (people.length === 0) return { assignments };
  chores.forEach((chore, index) => {
    const person = people[index % people.length];
    if (person) assignments[person]?.push(chore);
  });
  return { assignments };
}

export function createEmergencyCard(input: CreateEmergencyCardInput): {
  card: string;
} {
  const lines = [
    `Name: ${cleanText(input.name)}`,
    input.phone ? `Phone: ${redactLongNumbers(cleanText(input.phone))}` : undefined,
    ...(input.notes ?? []).map((note) => `Note: ${cleanText(note)}`),
    ...(input.contacts ?? []).map((contact) => `Contact: ${redactLongNumbers(cleanText(contact))}`),
  ].filter((line): line is string => Boolean(line));
  return { card: lines.join("\n") };
}

export function planMealIdeas(input: PlanMealIdeasInput): {
  ideas: string[];
  shoppingGaps: string[];
} {
  const ingredients = input.ingredients.map(cleanText).filter(Boolean);
  const base = ingredients.slice(0, 3).join(", ") || "what you have";
  const preference = input.preference ? ` (${cleanText(input.preference)})` : "";
  return {
    ideas: [
      `Quick bowl with ${base}${preference}.`,
      `Simple omelette or scramble using ${base}.`,
      `Fried rice or warm salad using ${base}.`,
    ],
    shoppingGaps: ["pantry staples", "fresh herbs or lemon if available"],
  };
}

export function createShoppingList(input: CreateShoppingListInput): {
  groups: Record<"produce" | "dairy" | "pantry" | "household" | "other", string[]>;
} {
  const groups = { produce: [] as string[], dairy: [] as string[], pantry: [] as string[], household: [] as string[], other: [] as string[] };
  for (const raw of input.items.map(cleanText).filter(Boolean)) {
    const item = raw.toLowerCase();
    if (/\b(bananas?|apples?|spinach|tomatoes?|onions?|potatoes?|lettuce|fruit|veg)\b/.test(item)) groups.produce.push(raw);
    else if (/\b(milk|eggs?|cheese|yoghurt|yogurt|butter)\b/.test(item)) groups.dairy.push(raw);
    else if (/\b(rice|pasta|flour|sugar|oil|bread|cereal)\b/.test(item)) groups.pantry.push(raw);
    else if (/\b(soap|detergent|cleaner|tissue|toilet|dish)\b/.test(item)) groups.household.push(raw);
    else groups.other.push(raw);
  }
  return { groups };
}

export function planPackingList(input: PlanPackingListInput): {
  title: string;
  items: string[];
} {
  const days = Math.max(1, Math.min(30, input.days ?? 1));
  const commitments = input.commitments?.map(cleanText).filter(Boolean) ?? [];
  const items = [
    `${days} outfit${days === 1 ? "" : "s"}`,
    "sleepwear",
    "toiletries",
    "wallet and ID",
    "phone charger",
    ...commitments,
  ];
  return {
    title: `Pack for ${cleanText(input.destination)}`,
    items: Array.from(new Set(items)),
  };
}

export function planAppointmentPrep(input: PlanAppointmentPrepInput): {
  opening: string;
  questions: string[];
  bring: string[];
} {
  const goals = input.goals?.map(cleanText).filter(Boolean) ?? [];
  return {
    opening: `I am here to discuss ${cleanText(input.concern)} with ${cleanText(input.provider)}.`,
    questions: [
      "What are the likely causes?",
      "What should I watch for after today?",
      ...goals.map((goal) => `Can we ${goal}?`),
    ],
    bring: ["Medicare card or ID", "Medication list", "Recent notes, photos, or results if relevant"],
  };
}

export function prepareDecisionMemo(input: PrepareDecisionMemoInput): {
  memo: string;
  nextStep: string;
} {
  const facts = input.facts?.map(cleanText).filter(Boolean) ?? [];
  return {
    memo: `Decision: ${cleanText(input.decision)}.\nKnown facts: ${facts.length ? facts.join("; ") : "none yet"}.`,
    nextStep: "Find one missing fact that would change the decision, then decide.",
  };
}

export function createHomeInventory(input: CreateHomeInventoryInput): {
  title: string;
  items: string[];
} {
  return {
    title: `${sentenceCase(input.area)} inventory`,
    items: input.items.map(cleanText).filter(Boolean),
  };
}

export function planHomeMaintenance(input: PlanHomeMaintenanceInput): {
  summary: string;
  steps: string[];
} {
  const item = cleanText(input.item);
  const issue = cleanText(input.issue);
  const urgency = input.urgency ? cleanText(input.urgency).toLowerCase() : "";
  const steps = [
    "Turn off power or water if it is safe and relevant.",
    "Take photos or a short video before touching anything.",
    "Move nearby items away from the problem area.",
    "Book qualified help if there is water, electricity, gas, or structural risk.",
  ];
  if (/urgent|today|now|leak|smell|spark/i.test(`${urgency} ${issue}`)) {
    steps.unshift("If there is active danger, stop using it and keep people away.");
  }
  return {
    summary: `${item}: ${issue}${urgency ? ` (${urgency})` : ""}.`,
    steps: Array.from(new Set(steps)),
  };
}

export function suggestGiftIdeas(input: SuggestGiftIdeasInput): {
  person: string;
  budget?: string;
  ideas: string[];
} {
  const person = sentenceCase(input.person);
  const interests = input.interests?.map(cleanText).filter(Boolean) ?? [];
  const interestText = interests.length ? interests.join(" and ") : "something they use at home";
  const budget = input.budget ? cleanText(input.budget) : undefined;
  const priceHint = budget ? ` within ${budget}` : "";
  return {
    person,
    budget,
    ideas: [
      `${person}: a thoughtful upgrade for ${interestText}${priceHint}.`,
      `${person}: a useful consumable or kit connected to ${interestText}${priceHint}.`,
      `${person}: an experience or voucher that keeps the choice flexible${priceHint}.`,
    ],
  };
}

export function planWeekend(input: PlanWeekendInput): {
  title: string;
  plan: string[];
} {
  const location = sentenceCase(input.location);
  const weather = cleanText(input.weather ?? "");
  const constraints = input.constraints?.map(cleanText).filter(Boolean) ?? [];
  const plan = [
    /rain|wet|storm/i.test(weather)
      ? `Choose one indoor activity in ${location}.`
      : `Choose one easy outdoor stop in ${location}.`,
    "Add one simple meal stop.",
    "Leave one clear rest window.",
    constraints.length ? `Keep it ${constraints.join(", ")}.` : "Keep the plan light.",
  ];
  return {
    title: `Weekend in ${location}`,
    plan,
  };
}

export function splitBudget(input: SplitBudgetInput): {
  totalCents: number;
  note?: string;
  shares: Array<{ person: string; amount: string }>;
} {
  const people = input.people.map(cleanText).filter(Boolean);
  const totalCents = parseMoneyToCents(input.amount) ?? 0;
  if (people.length === 0) {
    return {
      totalCents,
      note: input.note ? cleanText(input.note) : undefined,
      shares: [],
    };
  }
  const base = Math.floor(totalCents / people.length);
  const remainder = totalCents % people.length;
  return {
    totalCents,
    note: input.note ? cleanText(input.note) : undefined,
    shares: people.map((person, index) => ({
      person,
      amount: formatCents(base + (index < remainder ? 1 : 0)),
    })),
  };
}

export function createHabitPlan(input: CreateHabitPlanInput): {
  plan: string;
  steps: string[];
} {
  const habit = cleanText(input.habit);
  const time = input.time ? cleanText(input.time) : "a regular time";
  const trigger = input.trigger ? cleanText(input.trigger) : "an existing daily routine";
  return {
    plan: `Do ${habit} at ${time}.`,
    steps: [
      `Put it after ${trigger}.`,
      "Make the first version small enough to do on a bad day.",
      "Track it with one tick when done.",
    ],
  };
}

export function planLostItemSearch(input: PlanLostItemSearchInput): {
  title: string;
  steps: string[];
} {
  const item = cleanText(input.item);
  const lastSeen = input.lastSeen ? cleanText(input.lastSeen) : "the last place you remember using it";
  const places = input.places?.map(cleanText).filter(Boolean) ?? [];
  return {
    title: `Find ${item}`,
    steps: [
      `Start at ${lastSeen} and check slowly before moving on.`,
      ...places.map((place) => `Check ${place}.`),
      "Check bags, jackets, car pockets, and document folders.",
      "Pause and retrace the last time you definitely had it.",
    ],
  };
}

export function draftSchoolNote(input: DraftSchoolNoteInput): {
  note: string;
} {
  const date = input.date ? ` on ${cleanText(input.date)}` : "";
  return {
    note: `Hi, ${sentenceCase(input.child)} is absent${date} because ${cleanText(input.reason)}. Please let me know if you need anything else. Thanks.`,
  };
}

export function createPetCarePlan(input: CreatePetCarePlanInput): {
  title: string;
  checklist: string[];
} {
  const dates = input.dates ? ` (${cleanText(input.dates)})` : "";
  return {
    title: `${sentenceCase(input.pet)} care plan${dates}`,
    checklist: input.routine.map(cleanText).filter(Boolean),
  };
}

export function planPasswordReset(input: PlanPasswordResetInput): {
  account: string;
  steps: string[];
  warning: string;
} {
  const account = sentenceCase(input.account);
  const issue = input.issue ? cleanText(input.issue) : "access problem";
  return {
    account,
    steps: [
      `Use the official ${account} recovery page.`,
      `Select the option that matches: ${issue}.`,
      "Check recovery email, authenticator app, or saved backup codes.",
      "After recovery, update the password manager and enable 2-step verification.",
    ],
    warning: "Do not send passwords or codes to anyone.",
  };
}

export function createLeaveHomeChecklist(input: CreateLeaveHomeChecklistInput): {
  title: string;
  items: string[];
} {
  const duration = cleanText(input.duration || "short trip");
  const risks = input.risks?.map(cleanText).filter(Boolean) ?? [];
  return {
    title: `Leave home checklist for ${duration}`,
    items: [
      "Lock doors and windows.",
      "Check stove, oven, heater, and taps.",
      "Take wallet, keys, phone, and charger.",
      ...risks.map((risk) => `Check ${risk}.`),
    ],
  };
}

export function planCarTripPrep(input: PlanCarTripPrepInput): {
  title: string;
  checklist: string[];
} {
  const needs = input.needs?.map(cleanText).filter(Boolean) ?? [];
  const passengers = input.passengers?.map(cleanText).filter(Boolean) ?? [];
  return {
    title: `Car trip prep for ${cleanText(input.destination)}`,
    checklist: [
      "Check fuel, tyre pressure, lights, and windscreen washer fluid.",
      "Pack licence, sunglasses, water, and phone charger.",
      passengers.length ? `Plan seats and bags for ${passengers.join(", ")}.` : "Check seats and bags before leaving.",
      ...needs.map((need) => `Pack ${need}.`),
    ],
  };
}

export function createMedicineList(input: CreateMedicineListInput): {
  card: string;
  entries: string[];
  warning: string;
} {
  const entries = input.medicines.map(cleanText).filter(Boolean);
  const notes = input.notes?.map(cleanText).filter(Boolean) ?? [];
  const lines = [
    `Person: ${sentenceCase(input.person)}`,
    ...entries.map((entry) => `Medicine: ${entry}`),
    ...notes.map((note) => `Note: ${note}`),
  ];
  return {
    card: lines.join("\n"),
    entries,
    warning: "Check doses and changes with a doctor or pharmacist.",
  };
}

export function prepareSymptomNote(input: PrepareSymptomNoteInput): {
  summary: string;
  questions: string[];
  warning: string;
} {
  const symptoms = input.symptoms?.map(cleanText).filter(Boolean) ?? [];
  const questions = input.questions?.map(cleanText).filter(Boolean) ?? [];
  return {
    summary: `${cleanText(input.concern)}${input.duration ? ` for ${cleanText(input.duration)}` : ""}${symptoms.length ? `; symptoms: ${symptoms.join(", ")}` : ""}.`,
    questions: questions.length ? questions : ["What should I watch for?", "What are the next safe steps?"],
    warning: "If symptoms feel urgent or severe, contact a doctor or emergency service.",
  };
}

export function prepareBillDispute(input: PrepareBillDisputeInput): {
  steps: string[];
  message: string;
} {
  const provider = cleanText(input.provider);
  const amount = input.amount ? cleanText(input.amount) : "the disputed amount";
  const issue = cleanText(input.issue);
  return {
    steps: [
      "Gather the bill, previous bill, payment receipt, and any screenshots.",
      "Write down the exact line item being disputed.",
      "Ask for the correction or written explanation before paying the disputed part.",
    ],
    message: `Hi ${provider}, I am disputing ${amount} on my bill because ${issue}. Please review this charge and send the correction or explanation in writing.`,
  };
}

export function planGuestPrep(input: PlanGuestPrepInput): {
  title: string;
  checklist: string[];
} {
  const needs = input.needs?.map(cleanText).filter(Boolean) ?? [];
  return {
    title: `Guest prep for ${cleanText(input.guests)}`,
    checklist: [
      input.arrival ? `Confirm arrival: ${cleanText(input.arrival)}.` : "Confirm arrival time.",
      "Clear entry, bathroom, and main sitting area.",
      "Prepare drinks, simple snacks, and spare towels.",
      ...needs.map((need) => `Prepare ${need}.`),
    ],
  };
}

export function suggestKidActivity(input: SuggestKidActivityInput): {
  title: string;
  activities: string[];
} {
  const constraints = input.constraints?.map(cleanText).filter(Boolean) ?? [];
  const isIndoor = constraints.some((constraint) => /rain|inside|indoor|quiet/i.test(constraint));
  const time = input.time ? cleanText(input.time) : "30 minutes";
  return {
    title: `Activity ideas for ${sentenceCase(input.child)}${input.age ? `, age ${cleanText(input.age)}` : ""}`,
    activities: [
      isIndoor ? `indoor build challenge for ${time}.` : `Outdoor scavenger hunt for ${time}.`,
      `Drawing, Lego, or craft challenge with a clear finish in ${time}.`,
      "Reading or puzzle time with one small reward at the end.",
    ],
  };
}

export function planCleaningSprint(input: PlanCleaningSprintInput): {
  title: string;
  steps: string[];
} {
  const minutes = Math.max(5, Math.min(90, input.minutes ?? 20));
  const priorities = input.priorities?.map(cleanText).filter(Boolean) ?? [];
  return {
    title: `Clean ${cleanText(input.area)}`,
    steps: [
      `Set a ${minutes} minute timer.`,
      priorities.length ? `Start with ${priorities.join(", ")}.` : "Start with visible rubbish and dishes.",
      "Clear surfaces before deep cleaning.",
      "Put stray items into one basket.",
      "Stop when the timer ends and reset the room.",
    ],
  };
}

export function createMoveChecklist(input: CreateMoveChecklistInput): {
  title: string;
  checklist: string[];
} {
  return {
    title: `Move from ${cleanText(input.from)} to ${cleanText(input.to)}${input.date ? ` on ${cleanText(input.date)}` : ""}`,
    checklist: [
      "Confirm lease, settlement, keys, and moving date.",
      "Update utilities, internet, insurance, and mail forwarding.",
      "Pack documents, chargers, medicines, and daily essentials separately.",
      "Label boxes by room and priority.",
      "Photograph meter readings and property condition.",
    ],
  };
}

export function trackWarranty(input: TrackWarrantyInput): {
  summary: string;
  steps: string[];
} {
  const purchaseDate = input.purchaseDate ? cleanText(input.purchaseDate) : "purchase date unknown";
  const warranty = input.warranty ? cleanText(input.warranty) : "warranty length unknown";
  return {
    summary: `${cleanText(input.item)} bought ${purchaseDate}; warranty: ${warranty}.`,
    steps: [
      "Save the receipt, serial number, and product photo together.",
      "Check the brand warranty page before booking repair.",
      "If it fails, ask for repair, replacement, or refund in writing.",
    ],
  };
}

export function registerHomeAssistants(registry: ToolRegistry): void {
  registry.register({
    name: "extract_action_items",
    description: "Extract practical action items from messy life-admin text.",
    inputSchema: z.object({ text: z.string().min(1) }),
    handler: async (input: { text: string }, ctx) => extractActionItemsFromText({ ...input, now: ctx.now }),
  });

  registry.register({
    name: "triage_life_admin_note",
    description: "Sort a messy life-admin note into pay, reply, book, decide, save, and other buckets.",
    inputSchema: z.object({ text: z.string().min(1) }),
    handler: async (input: TriageLifeAdminNoteInput) => triageLifeAdminNote(input),
  });

  registry.register({
    name: "draft_warm_reply",
    description: "Draft a short warm reply for normal everyday messages.",
    inputSchema: z.object({
      recipient: z.string().optional(),
      situation: z.string().min(1),
      intent: z.string().min(1),
      tone: z.enum(["warm", "brief", "firm", "friendly"]).optional(),
    }),
    handler: async (input: DraftWarmReplyInput) => draftWarmReply(input),
  });

  registry.register({
    name: "compare_personal_options",
    description: "Compare everyday personal options and return a clear recommendation.",
    inputSchema: z.object({
      decision: z.string().min(1),
      options: z.array(z.object({ name: z.string().min(1), pros: z.array(z.string()).optional(), cons: z.array(z.string()).optional() })),
      priorities: z.array(z.string()).optional(),
    }),
    handler: async (input: ComparePersonalOptionsInput) => comparePersonalOptions(input),
  });

  registry.register({
    name: "plan_phone_call_script",
    description: "Prepare a simple phone-call script, key questions, and fallback SMS.",
    inputSchema: z.object({
      contact: z.string().min(1),
      goal: z.string().min(1),
      facts: z.array(z.string()).optional(),
    }),
    handler: async (input: PlanPhoneCallScriptInput) => planPhoneCallScript(input),
  });

  registry.register({
    name: "extract_renewal_watch",
    description: "Extract renewal, cancellation, and notice-date watch items from text.",
    inputSchema: z.object({ text: z.string().min(1) }),
    handler: async (input: ExtractRenewalWatchInput) => extractRenewalWatch(input),
  });

  registry.register({
    name: "prepare_firm_complaint",
    description: "Prepare a calm firm complaint message with a clear ask and deadline.",
    inputSchema: z.object({
      company: z.string().min(1),
      issue: z.string().min(1),
      desiredOutcome: z.string().min(1),
      deadline: z.string().optional(),
    }),
    handler: async (input: PrepareFirmComplaintInput) => prepareFirmComplaint(input),
  });

  registry.register({
    name: "clean_messy_note",
    description: "Turn a messy note into a short readable note.",
    inputSchema: z.object({ text: z.string().min(1) }),
    handler: async (input: CleanMessyNoteInput) => cleanMessyNote(input),
  });

  registry.register({
    name: "check_message_before_sending",
    description: "Check an outgoing message for heated tone, long sensitive numbers, or avoidable risk.",
    inputSchema: z.object({ text: z.string().min(1) }),
    handler: async (input: CheckMessageBeforeSendingInput) => checkMessageBeforeSending(input),
  });

  registry.register({
    name: "plan_travel_day",
    description: "Prepare a simple travel-day checklist from destination, date, and commitments.",
    inputSchema: z.object({
      destination: z.string().min(1),
      date: z.string().optional(),
      commitments: z.array(z.string()).optional(),
    }),
    handler: async (input: PlanTravelDayInput) => planTravelDay(input),
  });

  registry.register({
    name: "extract_bill_summary",
    description: "Extract a simple bill summary with provider, amount, due date, and safe next action.",
    inputSchema: z.object({ text: z.string().min(1) }),
    handler: async (input: ExtractBillSummaryInput) => extractBillSummary(input),
  });

  registry.register({
    name: "prepare_return_plan",
    description: "Prepare a return, refund, or warranty plan without inventing store policy.",
    inputSchema: z.object({
      item: z.string().min(1),
      purchaseInfo: z.string().optional(),
      issue: z.string().min(1),
    }),
    handler: async (input: PrepareReturnPlanInput) => prepareReturnPlan(input),
  });

  registry.register({
    name: "review_subscriptions",
    description: "Review subscription text and flag renewal or cancellation actions.",
    inputSchema: z.object({ text: z.string().min(1) }),
    handler: async (input: ReviewSubscriptionsInput) => reviewSubscriptions(input),
  });

  registry.register({
    name: "create_household_chore_split",
    description: "Split household chores evenly across people.",
    inputSchema: z.object({ people: z.array(z.string().min(1)), chores: z.array(z.string().min(1)) }),
    handler: async (input: CreateHouseholdChoreSplitInput) => createHouseholdChoreSplit(input),
  });

  registry.register({
    name: "create_emergency_card",
    description: "Create a compact emergency info card with long phone numbers masked.",
    inputSchema: z.object({
      name: z.string().min(1),
      phone: z.string().optional(),
      notes: z.array(z.string()).optional(),
      contacts: z.array(z.string()).optional(),
    }),
    handler: async (input: CreateEmergencyCardInput) => createEmergencyCard(input),
  });

  registry.register({
    name: "plan_meal_ideas",
    description: "Suggest simple meal ideas from ingredients and a preference.",
    inputSchema: z.object({ ingredients: z.array(z.string().min(1)), preference: z.string().optional() }),
    handler: async (input: PlanMealIdeasInput) => planMealIdeas(input),
  });

  registry.register({
    name: "create_shopping_list",
    description: "Group a shopping list into obvious supermarket sections.",
    inputSchema: z.object({ items: z.array(z.string().min(1)) }),
    handler: async (input: CreateShoppingListInput) => createShoppingList(input),
  });

  registry.register({
    name: "plan_packing_list",
    description: "Create a short packing list for a trip.",
    inputSchema: z.object({
      destination: z.string().min(1),
      days: z.number().int().positive().optional(),
      commitments: z.array(z.string()).optional(),
    }),
    handler: async (input: PlanPackingListInput) => planPackingList(input),
  });

  registry.register({
    name: "plan_appointment_prep",
    description: "Prepare notes, questions, and documents for an appointment.",
    inputSchema: z.object({
      provider: z.string().min(1),
      concern: z.string().min(1),
      goals: z.array(z.string()).optional(),
    }),
    handler: async (input: PlanAppointmentPrepInput) => planAppointmentPrep(input),
  });

  registry.register({
    name: "prepare_decision_memo",
    description: "Turn a messy decision into a small memo and next step.",
    inputSchema: z.object({ decision: z.string().min(1), facts: z.array(z.string()).optional() }),
    handler: async (input: PrepareDecisionMemoInput) => prepareDecisionMemo(input),
  });

  registry.register({
    name: "create_home_inventory",
    description: "Create a small inventory list for one home area.",
    inputSchema: z.object({ area: z.string().min(1), items: z.array(z.string().min(1)) }),
    handler: async (input: CreateHomeInventoryInput) => createHomeInventory(input),
  });

  registry.register({
    name: "plan_home_maintenance",
    description: "Plan safe first steps for a home maintenance issue.",
    inputSchema: z.object({
      item: z.string().min(1),
      issue: z.string().min(1),
      urgency: z.string().optional(),
    }),
    handler: async (input: PlanHomeMaintenanceInput) => planHomeMaintenance(input),
  });

  registry.register({
    name: "suggest_gift_ideas",
    description: "Suggest three practical gift ideas for a person, budget, and interests.",
    inputSchema: z.object({
      person: z.string().min(1),
      budget: z.string().optional(),
      interests: z.array(z.string()).optional(),
    }),
    handler: async (input: SuggestGiftIdeasInput) => suggestGiftIdeas(input),
  });

  registry.register({
    name: "plan_weekend",
    description: "Create a light weekend plan from location, weather, and constraints.",
    inputSchema: z.object({
      location: z.string().min(1),
      weather: z.string().optional(),
      constraints: z.array(z.string()).optional(),
    }),
    handler: async (input: PlanWeekendInput) => planWeekend(input),
  });

  registry.register({
    name: "split_budget",
    description: "Split a bill or budget evenly across people with stable cents.",
    inputSchema: z.object({
      amount: z.string().min(1),
      people: z.array(z.string().min(1)),
      note: z.string().optional(),
    }),
    handler: async (input: SplitBudgetInput) => splitBudget(input),
  });

  registry.register({
    name: "create_habit_plan",
    description: "Create a tiny habit plan using a time and trigger.",
    inputSchema: z.object({
      habit: z.string().min(1),
      time: z.string().optional(),
      trigger: z.string().optional(),
    }),
    handler: async (input: CreateHabitPlanInput) => createHabitPlan(input),
  });

  registry.register({
    name: "plan_lost_item_search",
    description: "Plan a calm search for a lost item from last seen and likely places.",
    inputSchema: z.object({
      item: z.string().min(1),
      lastSeen: z.string().optional(),
      places: z.array(z.string()).optional(),
    }),
    handler: async (input: PlanLostItemSearchInput) => planLostItemSearch(input),
  });

  registry.register({
    name: "draft_school_note",
    description: "Draft a plain school absence note.",
    inputSchema: z.object({
      child: z.string().min(1),
      reason: z.string().min(1),
      date: z.string().optional(),
    }),
    handler: async (input: DraftSchoolNoteInput) => draftSchoolNote(input),
  });

  registry.register({
    name: "create_pet_care_plan",
    description: "Create a pet care checklist for a date range.",
    inputSchema: z.object({
      pet: z.string().min(1),
      routine: z.array(z.string().min(1)),
      dates: z.string().optional(),
    }),
    handler: async (input: CreatePetCarePlanInput) => createPetCarePlan(input),
  });

  registry.register({
    name: "plan_password_reset",
    description: "Plan safe password reset steps without asking for passwords or codes.",
    inputSchema: z.object({
      account: z.string().min(1),
      issue: z.string().optional(),
    }),
    handler: async (input: PlanPasswordResetInput) => planPasswordReset(input),
  });

  registry.register({
    name: "create_leave_home_checklist",
    description: "Create a quick checklist before leaving home.",
    inputSchema: z.object({
      duration: z.string().min(1),
      risks: z.array(z.string()).optional(),
    }),
    handler: async (input: CreateLeaveHomeChecklistInput) => createLeaveHomeChecklist(input),
  });

  registry.register({
    name: "plan_car_trip_prep",
    description: "Prepare a simple car trip checklist.",
    inputSchema: z.object({
      destination: z.string().min(1),
      passengers: z.array(z.string()).optional(),
      needs: z.array(z.string()).optional(),
    }),
    handler: async (input: PlanCarTripPrepInput) => planCarTripPrep(input),
  });

  registry.register({
    name: "create_medicine_list",
    description: "Create a medicine list with a safety warning.",
    inputSchema: z.object({
      person: z.string().min(1),
      medicines: z.array(z.string().min(1)),
      notes: z.array(z.string()).optional(),
    }),
    handler: async (input: CreateMedicineListInput) => createMedicineList(input),
  });

  registry.register({
    name: "prepare_symptom_note",
    description: "Prepare a neutral symptom note for a health appointment without diagnosing.",
    inputSchema: z.object({
      concern: z.string().min(1),
      duration: z.string().optional(),
      symptoms: z.array(z.string()).optional(),
      questions: z.array(z.string()).optional(),
    }),
    handler: async (input: PrepareSymptomNoteInput) => prepareSymptomNote(input),
  });

  registry.register({
    name: "prepare_bill_dispute",
    description: "Prepare evidence-first steps and a message for disputing a bill.",
    inputSchema: z.object({
      provider: z.string().min(1),
      amount: z.string().optional(),
      issue: z.string().min(1),
    }),
    handler: async (input: PrepareBillDisputeInput) => prepareBillDispute(input),
  });

  registry.register({
    name: "plan_guest_prep",
    description: "Plan practical guest preparation for arrival and needs.",
    inputSchema: z.object({
      guests: z.string().min(1),
      arrival: z.string().optional(),
      needs: z.array(z.string()).optional(),
    }),
    handler: async (input: PlanGuestPrepInput) => planGuestPrep(input),
  });

  registry.register({
    name: "suggest_kid_activity",
    description: "Suggest simple child activities for time, age, and constraints.",
    inputSchema: z.object({
      child: z.string().min(1),
      age: z.string().optional(),
      time: z.string().optional(),
      constraints: z.array(z.string()).optional(),
    }),
    handler: async (input: SuggestKidActivityInput) => suggestKidActivity(input),
  });

  registry.register({
    name: "plan_cleaning_sprint",
    description: "Create a short timed cleaning sprint.",
    inputSchema: z.object({
      area: z.string().min(1),
      minutes: z.number().int().positive().optional(),
      priorities: z.array(z.string()).optional(),
    }),
    handler: async (input: PlanCleaningSprintInput) => planCleaningSprint(input),
  });

  registry.register({
    name: "create_move_checklist",
    description: "Create a moving checklist without claiming to book anything.",
    inputSchema: z.object({
      from: z.string().min(1),
      to: z.string().min(1),
      date: z.string().optional(),
    }),
    handler: async (input: CreateMoveChecklistInput) => createMoveChecklist(input),
  });

  registry.register({
    name: "track_warranty",
    description: "Track warranty details and receipt-first next steps.",
    inputSchema: z.object({
      item: z.string().min(1),
      purchaseDate: z.string().optional(),
      warranty: z.string().optional(),
    }),
    handler: async (input: TrackWarrantyInput) => trackWarranty(input),
  });
}
