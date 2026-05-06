// Inbound message router. Owns the fast-path intent detection and dispatch
// to the agent loop.

import type { AgentDeps } from "@nitsyclaw/shared/agent";
import { runAgent, buildSystemPrompt, loadCrossSurfaceHistory } from "@nitsyclaw/shared/agent";
import { detectIntent } from "@nitsyclaw/shared/utils";
import {
  registerAllFeatures,
  transcribeAndStore,
  processReceiptImage,
  analyzeLifeAdminIntake,
  checkMessageBeforeSending,
  cleanMessyNote,
  comparePersonalOptions,
  createEmergencyCard,
  createHabitPlan,
  createHomeInventory,
  createLeaveHomeChecklist,
  createMedicineList,
  createMoveChecklist,
  createHouseholdChoreSplit,
  createPetCarePlan,
  createShoppingList,
  draftWarmReply,
  draftSchoolNote,
  extractBillSummary,
  extractActionItemsFromText,
  extractDocumentTextFromMedia,
  extractRenewalWatch,
  planHomeMaintenance,
  planAppointmentPrep,
  planCarTripPrep,
  planCleaningSprint,
  planGuestPrep,
  planMealIdeas,
  planPackingList,
  planPhoneCallScript,
  planLostItemSearch,
  planPasswordReset,
  planTravelDay,
  planWeekend,
  prepareBillDispute,
  prepareDecisionMemo,
  prepareFirmComplaint,
  prepareReturnPlan,
  prepareSymptomNote,
  reviewSubscriptions,
  splitBudget,
  suggestKidActivity,
  suggestGiftIdeas,
  trackWarranty,
  triageLifeAdminNote,
} from "@nitsyclaw/shared/features";
import type { InboundMessage } from "@nitsyclaw/shared/whatsapp";
import {
  getLatestPendingConfirmation,
  insertMessage,
  insertFeatureRequest,
  listPendingFeatureRequests,
} from "@nitsyclaw/shared/db";
import { encryptForStorage, hashPhone, maskPhone } from "@nitsyclaw/shared/utils";
import { notifyAll } from "./notify-all.js";
import { parseFeatureRequestShortcut } from "./feature-shortcut.js";
import {
  parseBuildAgentShortcut,
  parseBugReportShortcut,
  parseFeatureQueueShortcut,
  parseHomeAssistantShortcut,
  parseLocationShortcut,
} from "./personal-command-shortcuts.js";
import { runDailyBuildAgent } from "./build-agent.js";

export class Router {
  private registry = registerAllFeatures({ surface: "whatsapp" });

  constructor(private deps: AgentDeps, private ownerPhone: string) {}

  /** Identify a non-receipt image via the LLM. Short prompt, low max-tokens,
   *  one-line output. Returns "an image of X" style description. */
  private async identifyImage(image: Buffer, mimetype: string): Promise<string> {
    try {
      // Reuse the imageAnalyzer's underlying client by issuing a non-receipt
      // prompt. We do this through llm.complete with an image content block
      // since extractReceipt is receipt-specific. Fall back to imageAnalyzer
      // raw text if available.
      const out = await this.deps.imageAnalyzer.extractReceipt(image, mimetype);
      const raw = out.rawText?.trim();
      if (raw && raw.length > 5) {
        // The vision call already happened; raw text often contains a
        // generic description even if structured fields are missing.
        return raw.slice(0, 280);
      }
    } catch (_e) {
      // ignore; fall through
    }
    return "an image (couldn't auto-classify)";
  }

  /** Send a WhatsApp message, persist it (direction='out', surface='whatsapp'),
   *  and fire a push notification (ntfy + optional Windows toast) so Nitesh
   *  isn't relying on WhatsApp's own self-chat notifications (which often
   *  silently fail). All three are best-effort; failure of any one doesn't
   *  block the others. */
  private async sendAndPersist(body: string): Promise<void> {
    await this.deps.whatsapp.send({ to: this.ownerPhone, body });
    try {
      const enc = encryptForStorage(body);
      await insertMessage(this.deps.db, {
        direction: "out",
        surface: "whatsapp",
        fromNumber: hashPhone(this.ownerPhone),
        body: enc,
      });
    } catch (e) {
      console.error("[router] failed to persist outbound", e);
    }
    notifyAll(body, { title: "NitsyClaw replied", priority: "default" }).catch(() => {});
  }

  private async sendPublicFailure(label: string, userMessage: string, error: unknown): Promise<void> {
    console.error("[router] handler failed", { label }, error);
    await this.sendAndPersist(userMessage);
  }

  private formatLifeAdminIntakeReply(result: ReturnType<typeof analyzeLifeAdminIntake>): string {
    const facts = result.keyFacts.slice(0, 4).map((fact) => `- ${fact.label}: ${fact.value}`);
    const action = result.suggestedActions[0];
    const lines = [
      `${result.title}: ${result.safePreview}`,
      ...facts,
      action ? `Next: ${action.label}.` : undefined,
      result.warnings[0],
    ].filter((line): line is string => Boolean(line));
    return lines.join("\n");
  }

  private formatHomeAssistantReply(shortcut: NonNullable<ReturnType<typeof parseHomeAssistantShortcut>>): string {
    const [first = "", second = "", third = "", fourth = ""] = shortcut.parts;
    switch (shortcut.kind) {
      case "sort-actions": {
        const result = extractActionItemsFromText({ text: shortcut.text, now: this.deps.now() });
        const lines = result.items.slice(0, 8).map((item, index) => {
          const due = item.dueHint ? ` (${item.dueHint})` : "";
          return `${index + 1}. ${item.title}${due}`;
        });
        return lines.length ? `Next steps:\n${lines.join("\n")}` : "I could not find clear action items. Try: next steps: pay bill by Friday. call dentist tomorrow.";
      }
      case "triage-admin": {
        const result = triageLifeAdminNote({ text: shortcut.text });
        const lines = Object.entries(result.buckets)
          .filter(([, items]) => items.length > 0)
          .map(([bucket, items]) => `${bucket}: ${items.join("; ")}`);
        return lines.length ? `Life admin sorted:\n${lines.join("\n")}` : "I could not sort that yet. Add a few more details after sort admin:";
      }
      case "clean-note": {
        return `Tidy note:\n${cleanMessyNote({ text: shortcut.text }).cleaned}`;
      }
      case "draft-reply": {
        const result = draftWarmReply({
          recipient: first || undefined,
          situation: second || shortcut.text,
          intent: third || "reply naturally",
        });
        return `Reply draft:\n${result.body}`;
      }
      case "compare-options": {
        const optionInputs = shortcut.parts.slice(1, -1);
        const options = optionInputs.length > 0
          ? optionInputs.map((option) => {
              const [name = option, ...rest] = option.split(";").map((part) => part.trim()).filter(Boolean);
              return { name, pros: rest.filter((part) => !/slow|expensive|cost|fee|lock/i.test(part)), cons: rest.filter((part) => /slow|expensive|cost|fee|lock/i.test(part)) };
            })
          : [{ name: "Option 1", pros: [shortcut.text] }];
        const result = comparePersonalOptions({
          decision: first || "Which option should I pick?",
          options,
          priorities: fourth ? [fourth] : undefined,
        });
        return `Recommendation: ${result.recommended}\nWhy: ${result.reason}`;
      }
      case "call-script": {
        const result = planPhoneCallScript({
          contact: first || "the company",
          goal: second || shortcut.text,
          facts: third ? [third] : undefined,
        });
        return `Call prep:\n${result.openingLine}\nQuestions:\n- ${result.keyQuestions.slice(0, 4).join("\n- ")}\nFallback text:\n${result.fallbackSms}`;
      }
      case "renewal-watch": {
        const result = extractRenewalWatch({ text: shortcut.text });
        const lines = result.items.map((item, index) => `${index + 1}. ${item.label}: ${item.action}${item.date ? ` by ${item.date}` : ""}`);
        return lines.length ? `Renewal watch:\n${lines.join("\n")}` : "No renewal or cancellation dates found. Paste the exact renewal/cancellation wording.";
      }
      case "complaint": {
        const result = prepareFirmComplaint({
          company: first || "the company",
          issue: second || shortcut.text,
          desiredOutcome: third || "fix the issue or explain it in writing",
          deadline: fourth || undefined,
        });
        return `Firm complaint:\n${result.message}`;
      }
      case "check-message": {
        const result = checkMessageBeforeSending({ text: shortcut.text });
        const flags = result.flags.length ? result.flags.join(", ") : "no major issues";
        return `Check before sending:\nFlags: ${flags}\nSafer version:\n${result.saferText}`;
      }
      case "travel-day": {
        const commitments = third ? third.split(",").map((part) => part.trim()).filter(Boolean) : undefined;
        const result = planTravelDay({
          destination: first || shortcut.text,
          date: second || undefined,
          commitments,
        });
        return `${result.title}\n- ${result.checklist.join("\n- ")}`;
      }
      case "bill-summary": {
        const result = extractBillSummary({ text: shortcut.text });
        return [
          "Bill summary",
          `Provider: ${result.provider}`,
          result.amount ? `Amount: ${result.amount}` : undefined,
          result.dueDate ? `Due: ${result.dueDate}` : undefined,
          `Next: ${result.nextAction}`,
        ].filter((line): line is string => Boolean(line)).join("\n");
      }
      case "return-plan": {
        const result = prepareReturnPlan({
          item: first || "the item",
          purchaseInfo: second || undefined,
          issue: third || shortcut.text,
        });
        return `Return plan\n${result.summary}\n- ${result.steps.join("\n- ")}\nMessage:\n${result.message}`;
      }
      case "subscription-check": {
        const result = reviewSubscriptions({ text: shortcut.text });
        const lines = result.items.map((item, index) => {
          const bits = [item.amount, item.cadence, item.reviewDate].filter(Boolean).join(", ");
          return `${index + 1}. ${item.name}${bits ? ` (${bits})` : ""}: ${item.action}`;
        });
        return lines.length ? `Subscriptions\n${lines.join("\n")}` : "No subscriptions found. Try: subscription check: Netflix $22 monthly.";
      }
      case "chore-split": {
        const people = first.split(",").map((part) => part.trim()).filter(Boolean);
        const chores = (second || shortcut.text).split(",").map((part) => part.trim()).filter(Boolean);
        const result = createHouseholdChoreSplit({ people, chores });
        const lines = Object.entries(result.assignments).map(([person, items]) => `${person}: ${items.join(", ") || "rest"}`);
        return lines.length ? `Chore split\n${lines.join("\n")}` : "Add people and chores like: chore split: Nitesh, Sam | dishes, bins";
      }
      case "emergency-card": {
        const contacts = fourth ? [fourth] : undefined;
        const result = createEmergencyCard({
          name: first || "Me",
          phone: second || undefined,
          notes: third ? [third] : undefined,
          contacts,
        });
        return `Emergency card\n${result.card}`;
      }
      case "meal-ideas": {
        const ingredients = first.split(",").map((part) => part.trim()).filter(Boolean);
        const result = planMealIdeas({
          ingredients: ingredients.length ? ingredients : shortcut.text.split(",").map((part) => part.trim()).filter(Boolean),
          preference: second || undefined,
        });
        return `Meal ideas\n- ${result.ideas.join("\n- ")}\nMaybe add: ${result.shoppingGaps.join(", ")}`;
      }
      case "shopping-list": {
        const result = createShoppingList({
          items: shortcut.text.split(",").map((part) => part.trim()).filter(Boolean),
        });
        const lines = Object.entries(result.groups)
          .filter(([, items]) => items.length > 0)
          .map(([group, items]) => `${group}: ${items.join(", ")}`);
        return lines.length ? `Shopping list\n${lines.join("\n")}` : "No shopping items found. Try: shopping list: milk, eggs, bananas.";
      }
      case "pack-list": {
        const days = Number((second || "").match(/\d+/)?.[0] ?? "1");
        const result = planPackingList({
          destination: first || shortcut.text,
          days,
          commitments: third ? third.split(",").map((part) => part.trim()).filter(Boolean) : undefined,
        });
        return `${result.title}\n- ${result.items.join("\n- ")}`;
      }
      case "appointment-prep": {
        const result = planAppointmentPrep({
          provider: first || "appointment",
          concern: second || shortcut.text,
          goals: third ? third.split(",").map((part) => part.trim()).filter(Boolean) : undefined,
        });
        return `Appointment prep\n${result.opening}\nQuestions:\n- ${result.questions.join("\n- ")}\nBring:\n- ${result.bring.join("\n- ")}`;
      }
      case "decision-memo": {
        const result = prepareDecisionMemo({
          decision: first || shortcut.text,
          facts: shortcut.parts.slice(1).filter(Boolean),
        });
        return `Decision memo\n${result.memo}\nNext: ${result.nextStep}`;
      }
      case "home-inventory": {
        const items = (second || shortcut.text).split(",").map((part) => part.trim()).filter(Boolean);
        const result = createHomeInventory({
          area: first || "Home",
          items,
        });
        return `Home inventory\n${result.title}\n- ${result.items.join("\n- ")}`;
      }
      case "maintenance-plan": {
        const result = planHomeMaintenance({
          item: first || "home item",
          issue: second || shortcut.text,
          urgency: third || undefined,
        });
        return `Maintenance plan\n${result.summary}\n- ${result.steps.join("\n- ")}`;
      }
      case "gift-ideas": {
        const result = suggestGiftIdeas({
          person: first || "them",
          budget: second || undefined,
          interests: third ? third.split(",").map((part) => part.trim()).filter(Boolean) : undefined,
        });
        return `Gift ideas for ${result.person}${result.budget ? ` (${result.budget})` : ""}\n- ${result.ideas.join("\n- ")}`;
      }
      case "weekend-plan": {
        const result = planWeekend({
          location: first || "home",
          weather: second || undefined,
          constraints: third ? third.split(",").map((part) => part.trim()).filter(Boolean) : undefined,
        });
        return `${result.title}\n- ${result.plan.join("\n- ")}`;
      }
      case "budget-split": {
        const result = splitBudget({
          amount: first || "$0",
          people: second.split(",").map((part) => part.trim()).filter(Boolean),
          note: third || undefined,
        });
        const lines = result.shares.map((share) => `${share.person}: ${share.amount}`);
        return `Budget split\nTotal: ${result.totalCents ? `$${(result.totalCents / 100).toFixed(2)}` : "$0.00"}${result.note ? ` (${result.note})` : ""}\n- ${lines.join("\n- ")}`;
      }
      case "habit-plan": {
        const result = createHabitPlan({
          habit: first || shortcut.text,
          time: second || undefined,
          trigger: third || undefined,
        });
        return `Habit plan\n${result.plan}\n- ${result.steps.join("\n- ")}`;
      }
      case "lost-item": {
        const result = planLostItemSearch({
          item: first || shortcut.text,
          lastSeen: second || undefined,
          places: third ? third.split(",").map((part) => part.trim()).filter(Boolean) : undefined,
        });
        return `${result.title}\n- ${result.steps.join("\n- ")}`;
      }
      case "school-note": {
        const result = draftSchoolNote({
          child: first || "my child",
          reason: second || shortcut.text,
          date: third || undefined,
        });
        return `School note\n${result.note}`;
      }
      case "pet-care": {
        const result = createPetCarePlan({
          pet: first || "Pet",
          routine: second ? second.split(",").map((part) => part.trim()).filter(Boolean) : [shortcut.text],
          dates: third || undefined,
        });
        return `${result.title}\n- ${result.checklist.join("\n- ")}`;
      }
      case "password-reset-plan": {
        const result = planPasswordReset({
          account: first || "account",
          issue: second || undefined,
        });
        return `Password reset plan\n- ${result.steps.join("\n- ")}\n${result.warning}`;
      }
      case "leave-home-checklist": {
        const result = createLeaveHomeChecklist({
          duration: first || shortcut.text,
          risks: second ? second.split(",").map((part) => part.trim()).filter(Boolean) : undefined,
        });
        return `${result.title}\n- ${result.items.join("\n- ")}`;
      }
      case "car-trip-prep": {
        const result = planCarTripPrep({
          destination: first || shortcut.text,
          passengers: second ? second.split(",").map((part) => part.trim()).filter(Boolean) : undefined,
          needs: third ? third.split(",").map((part) => part.trim()).filter(Boolean) : undefined,
        });
        return `${result.title}\n- ${result.checklist.join("\n- ")}`;
      }
      case "medicine-list": {
        const result = createMedicineList({
          person: first || "Me",
          medicines: second ? second.split(",").map((part) => part.trim()).filter(Boolean) : [shortcut.text],
          notes: third ? third.split(",").map((part) => part.trim()).filter(Boolean) : undefined,
        });
        return `Medicine list\n${result.card}\n${result.warning}`;
      }
      case "symptom-note": {
        const result = prepareSymptomNote({
          concern: first || shortcut.text,
          duration: second || undefined,
          symptoms: third ? third.split(",").map((part) => part.trim()).filter(Boolean) : undefined,
          questions: fourth ? fourth.split(",").map((part) => part.trim()).filter(Boolean) : undefined,
        });
        return `Symptom note\n${result.summary}\nQuestions:\n- ${result.questions.join("\n- ")}\n${result.warning}`;
      }
      case "bill-dispute": {
        const result = prepareBillDispute({
          provider: first || "the provider",
          amount: second || undefined,
          issue: third || shortcut.text,
        });
        return `Bill dispute\n- ${result.steps.join("\n- ")}\nMessage:\n${result.message}`;
      }
      case "guest-prep": {
        const result = planGuestPrep({
          guests: first || "guests",
          arrival: second || undefined,
          needs: third ? third.split(",").map((part) => part.trim()).filter(Boolean) : undefined,
        });
        return `${result.title}\n- ${result.checklist.join("\n- ")}`;
      }
      case "kid-activity": {
        const result = suggestKidActivity({
          child: first || "child",
          age: second || undefined,
          time: third || undefined,
          constraints: fourth ? fourth.split(",").map((part) => part.trim()).filter(Boolean) : undefined,
        });
        return `${result.title}\n- ${result.activities.join("\n- ")}`;
      }
      case "cleaning-plan": {
        const minutes = Number((second || "").match(/\d+/)?.[0] ?? "20");
        const result = planCleaningSprint({
          area: first || shortcut.text,
          minutes,
          priorities: third ? third.split(",").map((part) => part.trim()).filter(Boolean) : undefined,
        });
        return `${result.title}\n- ${result.steps.join("\n- ")}`;
      }
      case "move-checklist": {
        const result = createMoveChecklist({
          from: first || "old home",
          to: second || "new home",
          date: third || undefined,
        });
        return `${result.title}\n- ${result.checklist.join("\n- ")}`;
      }
      case "warranty-tracker": {
        const result = trackWarranty({
          item: first || shortcut.text,
          purchaseDate: second || undefined,
          warranty: third || undefined,
        });
        return `Warranty tracker\n${result.summary}\n- ${result.steps.join("\n- ")}`;
      }
    }
  }

  async handle(msg: InboundMessage): Promise<void> {
    if (msg.from !== this.ownerPhone) return; // R2 — only owner

    // Load cross-surface history BEFORE persisting current turn so it isn't included.
    const history = await loadCrossSurfaceHistory(
      this.deps.db,
      hashPhone(this.ownerPhone),
      20,
    ).catch((e) => {
      console.error("[router] history load failed", e);
      return [];
    });

    // Persist inbound (R5: single source of truth).
    const encryptedBody = encryptForStorage(msg.body);
    const persisted = await insertMessage(this.deps.db, {
      direction: "in",
      surface: "whatsapp",
      waMessageId: msg.id,
      fromNumber: hashPhone(msg.from),
      body: encryptedBody,
      mediaType: msg.mediaType ?? null,
      metadata: { masked: maskPhone(msg.from) },
    });

    // 1. Voice note → transcribe → continue as if it were text.
    let effectiveText = msg.body;
    if (msg.mediaType === "voice" && msg.downloadMedia) {
      try {
        const media = await msg.downloadMedia();
        const { transcript } = await transcribeAndStore({
          audio: media.data,
          mimetype: media.mimetype,
          transcriber: this.deps.transcriber,
          db: this.deps.db,
          sourceMessageId: persisted.id,
        });
        effectiveText = transcript;
        await this.sendAndPersist(
          `📝 Transcribed. I will reply in English.\n${transcript}`,
        );
      } catch (e) {
        await this.sendPublicFailure("voice transcription", "Couldn't transcribe that voice note. I logged it; try again shortly.", e);
        return;
      }
    }

    // 2. Image → try receipt first; if extraction yields no amount, fall back
    //    to general image identification (feature_request fr_29956dc5).
    if (msg.mediaType === "image" && msg.downloadMedia) {
      try {
        const media = await msg.downloadMedia();
        const out = await processReceiptImage({
          image: media.data,
          mimetype: media.mimetype,
          analyzer: this.deps.imageAnalyzer,
          db: this.deps.db,
          now: this.deps.now(),
          sourceMessageId: persisted.id,
        });
        if (out && out.amount && out.amount > 0) {
          await this.sendAndPersist(
            `💸 Logged ${out.currency} ${out.amount} (${out.category}) at ${out.merchant ?? "unknown"}`,
          );
          return;
        }
        // Receipt extraction returned nothing useful — treat as general image.
        const description = await this.identifyImage(media.data, media.mimetype);
        await this.sendAndPersist(
          `📸 I see: ${description}\n\nWhat would you like to do? Reply with: "save as memory", "set a reminder about this", "log expense ${out?.rawText ? `(${out.rawText})` : ""}", or just describe what you want.`,
        );
      } catch (_imageError) {
        // Even receipt parsing crashed (vision API failure, etc.). Try general path.
        try {
          const media = await msg.downloadMedia();
          const description = await this.identifyImage(media.data, media.mimetype);
          await this.sendAndPersist(
            `📸 I see: ${description}\n\nWhat would you like to do? Reply with: "save as memory", "set a reminder", or describe what you want.`,
          );
        } catch (e2) {
          await this.sendPublicFailure("image read", "Couldn't read that image. I logged it; try again shortly.", e2);
        }
      }
      return;
    }

    // 2.25. Document uploads get an honest intake response. We use metadata and
    // any provided caption/text, but do not claim PDF/OCR parsing yet.
    if (msg.mediaType === "document") {
      try {
        const media = msg.downloadMedia ? await msg.downloadMedia() : undefined;
        const extracted = media
          ? await extractDocumentTextFromMedia({
              data: media.data,
              filename: media.filename,
              mimetype: media.mimetype,
            })
          : undefined;
        const extractedWarning = extracted && !extracted.supported ? extracted.reason : undefined;
        const documentText = [effectiveText, extracted?.text].filter((part) => part?.trim()).join("\n\n");
        const result = analyzeLifeAdminIntake({
          text: documentText,
          mediaType: "document",
          filename: media?.filename,
          mimetype: media?.mimetype,
          now: this.deps.now(),
        });
        const reply = this.formatLifeAdminIntakeReply({
          ...result,
          warnings: [...result.warnings, ...(extractedWarning ? [extractedWarning] : [])],
        });
        await this.sendAndPersist(reply);
      } catch (documentError) {
        await this.sendPublicFailure("document intake", "I received the document, but couldn't inspect it safely. Try pasting the key text or uploading a screenshot.", documentError);
      }
      return;
    }

    // 2.5 — feature request shortcuts (feature_request fr_96407890).
    //      Fast path for power users: skip the agent loop, persist directly.
    const featureShortcut = parseFeatureRequestShortcut(effectiveText);
    if (featureShortcut) {
      const description = featureShortcut.description;
      if (description.length < 5) {
        await this.sendAndPersist(
          `That description is too short. Try: feature request: voice input on dashboard /chat using Web Speech API`,
        );
        return;
      }
      try {
        const row = await insertFeatureRequest(this.deps.db, {
          description,
          type: "feature",
          size: "M",
          source: "whatsapp",
          requestedBy: hashPhone(this.ownerPhone),
        });
        await this.sendAndPersist(
          `✅ Queued! ID: ${row.id.slice(0, 8)}. Build agent picks it up at next run.`,
        );
      } catch (e) {
        await this.sendPublicFailure("feature queue", "Couldn't queue that feature. I logged it; try again shortly.", e);
      }
      return;
    }

    const homeShortcut = parseHomeAssistantShortcut(effectiveText);
    if (homeShortcut) {
      try {
        await this.sendAndPersist(this.formatHomeAssistantReply(homeShortcut));
      } catch (homeShortcutError) {
        await this.sendPublicFailure("home helper shortcut", "Could not run that home helper. Try the same request in plain words.", homeShortcutError);
      }
      return;
    }

    const locationShortcut = parseLocationShortcut(effectiveText);
    if (locationShortcut) {
      const tool = this.registry.get("set_current_location");
      try {
        const out = tool
          ? ((await tool.handler(
              { city: locationShortcut.city, expiresHint: locationShortcut.expiresHint },
              {
                userPhone: msg.from,
                now: this.deps.now(),
                timezone: this.deps.timezone,
                deps: this.deps,
              },
            )) as { location?: string; expiresHint?: string })
          : null;
        await this.sendAndPersist(
          out?.expiresHint
            ? `Location updated: ${out.location} until ${out.expiresHint}.`
            : `Location updated: ${out?.location ?? locationShortcut.city}.`,
        );
      } catch (locationError) {
        await this.sendPublicFailure("location save", "Couldn't save that location. I logged it; try again shortly.", locationError);
      }
      return;
    }

    const bugShortcut = parseBugReportShortcut(effectiveText);
    if (bugShortcut) {
      try {
        const row = await insertFeatureRequest(this.deps.db, {
          description: bugShortcut.description,
          type: "bug",
          severity: "P1",
          size: "M",
          source: "whatsapp",
          requestedBy: hashPhone(this.ownerPhone),
          dedupeKey: bugShortcut.description.toLowerCase().slice(0, 160),
        });
        await this.sendAndPersist(
          `Logged as bug ${row.id.slice(0, 8)}. I captured it as existing broken behavior, not a new feature.`,
        );
      } catch (bugError) {
        await this.sendPublicFailure("bug queue", "Couldn't log that bug. I logged it; try again shortly.", bugError);
      }
      return;
    }

    const featureQueue = parseFeatureQueueShortcut(effectiveText);
    if (featureQueue) {
      try {
        const rows = await listPendingFeatureRequests(this.deps.db);
        const top = rows.slice(0, featureQueue.limit);
        const lines = top.map((row, index) => {
          const label = row.type === "bug" ? `bug ${row.severity ?? ""}`.trim() : "feature";
          return `${index + 1}. ${row.id.slice(0, 8)} ${label}: ${row.description.slice(0, 90)}`;
        });
        await this.sendAndPersist(
          lines.length
            ? `Pending queue (${rows.length} total):\n${lines.join("\n")}`
            : "No pending feature or bug queue items.",
        );
      } catch (queueError) {
        await this.sendPublicFailure("feature queue load", "Couldn't load the feature queue. I logged it; try again shortly.", queueError);
      }
      return;
    }

    const buildAgent = parseBuildAgentShortcut(effectiveText);
    if (buildAgent) {
      try {
        const rows = await listPendingFeatureRequests(this.deps.db);
        if (rows.length === 0) {
          await this.sendAndPersist("Build agent checked the queue. No pending features or bugs.");
          return;
        }

        const preview = rows
          .slice(0, 5)
          .map((row, index) => `${index + 1}. ${row.id.slice(0, 8)} ${row.description.slice(0, 80)}`)
          .join("\n");

        if (buildAgent.dryRun) {
          await this.sendAndPersist(
            `Build queue preview (${rows.length} pending):\n${preview}`,
          );
          return;
        }

        await this.sendAndPersist(
          `Build agent checked ${rows.length} pending item(s). I will post the queue summary here. Implementation still happens in Claude Code.`,
        );
        await runDailyBuildAgent(this.deps, this.ownerPhone);
      } catch (e) {
        await this.sendPublicFailure("build agent run", "Build agent run failed. I logged it; try again shortly.", e);
      }
      return;
    }

    // 3. Confirmation y/n short-circuit (no LLM needed).
    const intent = detectIntent(effectiveText);
    if (intent === "confirmation") {
      const confirmationTool = this.registry.get("resolve_confirmation");
      const confirmationId = parseConfirmationId(effectiveText);
      const reply = /^(y|yes|approve|confirm|ok|okay)\b/i.test(effectiveText.trim())
        ? "yes"
        : "no";
      if (!confirmationId) {
        const latest = await getLatestPendingConfirmation(this.deps.db);
        if (latest && confirmationNeedsExplicitId(latest.action)) {
          await this.sendAndPersist(
            `${confirmationActionLabel(latest.action)} need the confirmation id. Reply ${reply} ${latest.id} to resolve this safely.`,
          );
          return;
        }
      }
      const out = confirmationTool
        ? await confirmationTool.handler(
            { reply, ...(confirmationId ? { confirmationId } : {}) },
            {
              userPhone: msg.from,
              now: this.deps.now(),
              timezone: this.deps.timezone,
              deps: this.deps,
            },
          )
        : null;
      if (out && (out as { resolved?: boolean }).resolved) {
        const resolved = out as {
          decision?: string;
          action?: string;
          playlist?: { name?: string; url?: string; added?: number };
          link?: string;
          draftCreated?: boolean;
          provider?: string;
          draftId?: string;
          unavailable?: string;
        };
        if (resolved.playlist) {
          await this.sendAndPersist(
            `Done. Created Spotify playlist "${resolved.playlist.name ?? "playlist"}" with ${resolved.playlist.added ?? 0} tracks.\n${resolved.playlist.url ?? ""}`.trim(),
          );
        } else if (resolved.link) {
          await this.sendAndPersist(`Confirmation: ${resolved.decision}\n${resolved.link}`);
        } else if (resolved.action === "email_create_draft") {
          await this.sendAndPersist(
            resolved.draftCreated
              ? `Email draft created in ${resolved.provider ?? "mailbox"}.\nDraft id: ${resolved.draftId ?? "unknown"}`
              : `Email draft not created yet: ${resolved.unavailable ?? "email adapter unavailable"}`,
          );
        } else {
          await this.sendAndPersist(`Confirmation: ${resolved.decision ?? "resolved"}`);
        }
        return;
      }
    }

    // 4. Default — agent loop with cross-surface history.
    const result = await runAgent({
      userPhone: msg.from,
      userMessage: effectiveText,
      history,
      systemPrompt: buildSystemPrompt({ surface: "whatsapp", profile: this.deps.profile }),
      registry: this.registry,
      deps: this.deps,
    });
    // The agent should have already replied via reply_to_user; only echo if it didn't.
    const replyToUserCall = result.toolCalls.find((c) => c.name === "reply_to_user" && c.success);
    if (replyToUserCall) {
      // The tool already sent via WhatsApp; persist the reply for cross-surface history.
      const text = (replyToUserCall.input as { text?: string })?.text ?? "";
      if (text.trim()) {
        try {
          const enc = encryptForStorage(text);
          await insertMessage(this.deps.db, {
            direction: "out",
            surface: "whatsapp",
            fromNumber: hashPhone(this.ownerPhone),
            body: enc,
          });
        } catch (e) {
          console.error("[router] failed to persist reply_to_user outbound", e);
        }
        notifyAll(text, { title: "NitsyClaw replied", priority: "default" }).catch(() => {});
      }
    } else if (result.finalText.trim()) {
      await this.sendAndPersist(result.finalText);
    }
  }

}

function parseConfirmationId(text: string): string | undefined {
  return text.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i)?.[0];
}

function confirmationNeedsExplicitId(action: string): boolean {
  return action === "email_create_draft" ||
    action === "create_calendar_event" ||
    action === "spotify_create_playlist";
}

function confirmationActionLabel(action: string): string {
  switch (action) {
    case "email_create_draft":
      return "Email drafts";
    case "create_calendar_event":
      return "Calendar changes";
    case "spotify_create_playlist":
      return "Spotify playlist creation";
    default:
      return "Pending actions";
  }
}
