// Inbound message router. Owns the fast-path intent detection and dispatch
// to the agent loop.

import type { AgentDeps } from "@nitsyclaw/shared/agent";
import { runAgent, buildSystemPrompt, loadCrossSurfaceHistory } from "@nitsyclaw/shared/agent";
import type { HistoryTurn } from "@nitsyclaw/shared/agent";
import { privateOwnerTenantForPhone } from "@nitsyclaw/shared/tenancy";
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
  categorizeExpense,
  createHouseholdChoreSplit,
  createPetCarePlan,
  createShoppingList,
  draftWarmReply,
  draftSchoolNote,
  extractBillSummary,
  extractActionItemsFromText,
  extractDocumentTextFromMedia,
  importExpensesFromCsv,
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
  planReminder,
  trackWarranty,
  triageLifeAdminNote,
  formatFeatureQueueStatusForWhatsApp,
  resolvePromptProfileFromContext,
  summarizeFeatureQueueStatus,
} from "@nitsyclaw/shared/features";
import type { InboundMessage } from "@nitsyclaw/shared/whatsapp";
import {
  getLatestPendingConfirmation,
  insertMessage,
  insertExpense,
  insertReminder,
  insertFeatureRequest,
  getConnectedAccount,
  getSystemHeartbeat,
  listRecentCommandJobs,
  listPendingReminders,
  listPendingFeatureRequests,
  listRecentFeatureRequestsByStatus,
  recentExpensesBetween,
  recentMessages,
  updateMessageMetadata,
} from "@nitsyclaw/shared/db";
import {
  completeCommandJob,
  createCommandJob,
  getCommandJobByDedupeKey,
  markCommandJobWorking,
  refreshCommandJobIntent,
  recordCommandJobFailure,
} from "@nitsyclaw/shared/ops/command-jobs";
import type { CommandJob } from "@nitsyclaw/shared/db";
import type { SystemHeartbeat } from "@nitsyclaw/shared/db";
import { classifyHeartbeat } from "@nitsyclaw/shared/ops/heartbeat";
import { canAgentClarifySafely } from "@nitsyclaw/shared/ops/personal-pa-intent";
import {
  encryptForStorage,
  formatPrivateModeActionBlocked,
  formatPrivateModeHelp,
  hashPhone,
  isPrivateModeHelpRequest,
  maskPhone,
  parseExpenseText,
  parsePrivateModeInput,
  privateModeWouldPersist,
  sanitizeUserFacingReply,
} from "@nitsyclaw/shared/utils";
import { notifyAll } from "./notify-all.js";
import { parseFeatureRequestShortcut } from "./feature-shortcut.js";
import {
  parseBuildAgentShortcut,
  parseAutonomousWorkShortcut,
  parseBugReportShortcut,
  parseCantDoGuardShortcut,
  parseCapabilityStatusShortcut,
  parseCommandContractShortcut,
  parseDailyStatusShortcut,
  parseFeatureQueueShortcut,
  parseHelpShortcut,
  parsePendingFeatureDevelopmentShortcut,
  parseWhatsAppCanaryShortcut,
  parseWhatsAppControlPlaneShortcut,
  parseWhatsAppIncidentSummaryShortcut,
  parseWhatsAppSelfTestShortcut,
  mentionsFeatureQueueStatus,
  parseHomeAssistantShortcut,
  parseNightlyHealthShortcut,
  parseQueuedIntegrationShortcut,
  parseLocalStatusShortcut,
  parseLocationStatusShortcut,
  parseLocationShortcut,
  parsePeopleMemoryShortcut,
  parseRepeatLastMessageShortcut,
} from "./personal-command-shortcuts.js";
import { runDailyBuildAgent } from "./build-agent.js";
import { buildBotRuntimeMetadata } from "./bot-runtime.js";
import { buildNightlyWhatsAppHealthReport } from "./nightly-health-report.js";
import { logBotError } from "./safe-log.js";
import { formatWhatsAppReplyShape } from "./whatsapp-reply-format.js";
import {
  formatReadyCapabilitiesOneLine,
  formatWhatsAppCantDoGuard,
  formatWhatsAppCommandContractReply,
  formatWhatsAppHelpReply,
  formatWhatsAppPendingFeatureDevelopmentPlan,
  formatWhatsAppProviderSetupSnapshot,
} from "./whatsapp-capabilities.js";
import {
  type WhatsAppProviderReadiness,
  type WhatsAppProviderReadinessKey,
  getWhatsAppProviderReadiness,
} from "./whatsapp-provider-readiness.js";

export class Router {
  private registry = registerAllFeatures({ surface: "whatsapp" });
  private readonly seenExternalMessageIds = new Set<string>();
  private readonly seenExternalMessageOrder: string[] = [];

  constructor(private deps: AgentDeps, private ownerPhone: string) {}

  private tenant() {
    return privateOwnerTenantForPhone(this.ownerPhone);
  }

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
    body = sanitizeUserFacingReply(body);
    if (!body) return;
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
      logBotError("[router] failed to persist outbound", e);
    }
    notifyAll(body, { title: "NitsyClaw replied", priority: "default" }).catch(() => {});
  }

  private async sendWithoutPersistence(body: string): Promise<void> {
    body = sanitizeUserFacingReply(body);
    if (!body) return;
    await this.deps.whatsapp.send({ to: this.ownerPhone, body });
  }

  private async answerPrivateMode(text: string): Promise<string> {
    if (isPrivateModeHelpRequest(text)) {
      return formatPrivateModeHelp();
    }
    if (privateModeWouldPersist(text)) {
      return formatPrivateModeActionBlocked();
    }
    const promptProfile = await resolvePromptProfileFromContext(this.deps.db, {
      userPhone: this.ownerPhone,
      now: this.deps.now(),
      fallback: this.deps.profile,
    }).catch(() => this.deps.profile);
    const response = await this.deps.llm.complete({
      system: [
        buildSystemPrompt({ surface: "whatsapp", profile: promptProfile }),
        "Private mode is active for this single turn.",
        "Do not use tools, do not save memory, do not ask to persist anything, and do not claim you saved anything.",
        "Answer or draft only. If the user asks for any action that would save, send, delete, book, pay, call, or change outside data, say private mode cannot do that.",
      ].join("\n\n"),
      messages: [{ role: "user", content: text }],
      maxTokens: 700,
    });
    return response.text.trim() || "Private mode is on. I could not produce a useful reply.";
  }

  private async sendPublicFailure(label: string, userMessage: string, error: unknown): Promise<void> {
    logBotError("[router] handler failed", error, { label });
    await this.sendAndPersist(userMessage);
  }

  private async sendAndPersistBestEffort(body: string, label: string): Promise<void> {
    try {
      await this.sendAndPersist(body);
    } catch (error) {
      logBotError("[router] best-effort reply delivery failed", error, { label });
    }
  }

  private async createWhatsAppCommandJob(
    msg: InboundMessage,
    persistedId: string,
    command: string,
    allowAgentClarification: boolean,
    opts: { maxAttempts?: number } = {},
  ): Promise<CommandJob> {
    return createCommandJob(this.deps.db, {
      source: "whatsapp",
      ownerHash: hashPhone(this.ownerPhone),
      command,
      sourceMessageId: persistedId,
      sourceExternalId: msg.id,
      dedupeKey: `whatsapp:${msg.id}`,
      allowAgentClarification,
      maxAttempts: opts.maxAttempts,
    });
  }

  private async completeWhatsAppCommandJob(job: CommandJob, resultText: string): Promise<void> {
    try {
      await completeCommandJob(this.deps.db, job.id, resultText);
    } catch (error) {
      logBotError("[router] failed to complete command job", error, { commandJobId: job.id });
    }
  }

  private async failWhatsAppCommandJob(job: CommandJob, error: unknown): Promise<void> {
    try {
      await recordCommandJobFailure(this.deps.db, job.id, error);
    } catch (recordError) {
      logBotError("[router] failed to record command job failure", recordError, { commandJobId: job.id });
    }
  }

  private async sendFeatureQueueStatus(limit: number): Promise<void> {
    const [rows, completed] = await Promise.all([
      listPendingFeatureRequests(this.deps.db),
      listRecentFeatureRequestsByStatus(this.deps.db, "done", limit),
    ]);
    const summary = summarizeFeatureQueueStatus({ pending: rows, completed, limit });
    await this.sendAndPersist(formatFeatureQueueStatusForWhatsApp(summary));
  }

  private async getProviderReadiness(): Promise<Record<WhatsAppProviderReadinessKey, WhatsAppProviderReadiness>> {
    let spotifyConnected = false;
    let spotifyExpiresAt: Date | string | null | undefined;
    try {
      const account = await getConnectedAccount(this.deps.db, {
        provider: "spotify",
        ownerHash: hashPhone(this.ownerPhone),
      });
      spotifyConnected = Boolean(account);
      spotifyExpiresAt = account?.expiresAt;
    } catch (error) {
      logBotError("[router] provider readiness check failed", error, { provider: "spotify" });
    }
    return getWhatsAppProviderReadiness(process.env, { spotifyConnected, spotifyExpiresAt });
  }

  private async sendCapabilityStatus(limit: number): Promise<void> {
    const [rows, completed] = await Promise.all([
      listPendingFeatureRequests(this.deps.db),
      listRecentFeatureRequestsByStatus(this.deps.db, "done", limit),
    ]);
    const summary = summarizeFeatureQueueStatus({ pending: rows, completed, limit });
    const localNext = summary.quickWins[0] ?? summary.recommendedNext ?? summary.topPending[0];
    const setupNext = summary.setupHeavy[0];
    const shipped = summary.recentCompleted[0];
    const providerReadiness = await this.getProviderReadiness();

    await this.sendAndPersist(formatWhatsAppReplyShape({
      answer: "Status: ready",
      state: "State: WhatsApp and local tools are available; external providers still need setup.",
      details: [
        `Ready: ${formatReadyCapabilitiesOneLine()}`,
        formatWhatsAppProviderSetupSnapshot(providerReadiness),
        "Queue:",
        `- Pending: ${summary.pendingCount} item(s).`,
        localNext ? `- Best local next: ${localNext.shortId}: ${clipForWhatsApp(localNext.description, 90)}` : "- Best local next: none found.",
        setupNext ? `- Needs setup: ${setupNext.shortId}: ${clipForWhatsApp(setupNext.description, 90)}` : "- Needs setup: none found.",
        shipped ? `- Shipped: ${shipped.shortId}: ${clipForWhatsApp(shipped.description, 80)}` : "- Shipped: none found.",
        "Safety: drafts first. External sending, calling, deleting, booking, paying, or changing data needs confirmation.",
      ],
      next: "local status | feature queue | what went wrong | proof test",
    }));
  }

  private async formatLocalStatusReply(
    kind: NonNullable<ReturnType<typeof parseLocalStatusShortcut>>["kind"],
    userPhone: string,
  ): Promise<string> {
    if (kind === "all") {
      const [files, reminders, expenses] = await Promise.all([
        this.formatFilesStatusLine(userPhone),
        this.formatRemindersStatusLine(),
        this.formatExpenseStatusLine(),
      ]);
      return formatWhatsAppReplyShape({
        answer: "Local status: ready",
        state: "State: checked local files, reminders, expenses, and summary tools. No external accounts used.",
        details: [
          files,
          reminders,
          expenses,
          "Summaries: bill summary, tidy note, next steps, check before send.",
        ],
        next: "files | reminders | expense summary | bill summary: <text>",
      });
    }

    const sections: string[] = [];
    if (kind === "files") sections.push(await this.formatFilesStatus(userPhone));
    if (kind === "reminders") sections.push(await this.formatRemindersStatus());
    if (kind === "expenses") sections.push(await this.formatExpenseStatus());
    if (kind === "summaries") sections.push(this.formatSummaryStatus());
    return sections.join("\n\n");
  }

  private async formatDailyStatusReply(userPhone: string): Promise<string> {
    const now = this.deps.now();
    const date = now.toLocaleDateString("en-AU", {
      timeZone: this.deps.timezone,
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const [reminders, documents, expenses, pendingQueue] = await Promise.all([
      listPendingReminders(this.deps.db, this.tenant(), now, 3),
      this.getRecentDocumentLines(userPhone, 3),
      this.getMonthlyExpenseSnapshot(),
      listPendingFeatureRequests(this.deps.db),
    ]);
    const reminderLines = reminders.length
      ? reminders.map((row) => `- ${row.text} (${row.fireAt.toISOString().slice(0, 16).replace("T", " ")})`).join("\n")
      : "- No pending reminders found.";
    const queueSummary = summarizeFeatureQueueStatus({ pending: pendingQueue, limit: 3 });
    const nextQueue = queueSummary.recommendedNext ?? queueSummary.quickWins[0] ?? queueSummary.topPending[0];
    return [
      `Daily status - ${date}`,
      "",
      "Reminders",
      reminderLines,
      "",
      "Expenses",
      expenses,
      "",
      "Files",
      documents,
      "",
      "Queue",
      `- ${queueSummary.pendingCount} pending item(s).`,
      nextQueue ? `- Best local next: ${nextQueue.shortId}: ${nextQueue.description}` : "- No pending queue rows found.",
      "",
      "No external accounts used. This is from local NitsyClaw history only.",
    ].join("\n");
  }

  private async getRecentDocumentLines(userPhone: string, limit: number): Promise<string> {
    const rows = await recentMessages(this.deps.db, hashPhone(userPhone), 80);
    const documents = rows.filter((row) => row.mediaType === "document").slice(0, limit);
    if (!documents.length) return "- No recent local document uploads found.";
    return documents.map((row) => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      const filename = typeof metadata.filename === "string" ? metadata.filename : "document";
      return `- ${filename}`;
    }).join("\n");
  }

  private async formatFilesStatusLine(userPhone: string): Promise<string> {
    const rows = await recentMessages(this.deps.db, hashPhone(userPhone), 80);
    const documents = rows.filter((row) => row.mediaType === "document").slice(0, 2);
    if (!documents.length) return "Files: no recent local document uploads.";
    const names = documents.map((row) => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      return typeof metadata.filename === "string" ? metadata.filename : "document";
    });
    return `Files: ${names.join(", ")}.`;
  }

  private async formatRemindersStatusLine(): Promise<string> {
    const rows = await listPendingReminders(this.deps.db, this.tenant(), this.deps.now(), 2);
    if (!rows.length) return "Reminders: clear. No pending WhatsApp reminders.";
    const next = rows[0]!;
    const more = rows.length > 1 ? ` +${rows.length - 1} more` : "";
    return `Reminders: next is ${next.text} at ${this.formatLocalDateTime(next.fireAt)}${more}.`;
  }

  private async formatExpenseStatusLine(): Promise<string> {
    const now = this.deps.now();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const rows = await recentExpensesBetween(this.deps.db, this.tenant(), from, now, 200);
    if (!rows.length) return "Expenses: clear for this month. AUD is the default; no bank feed connected.";
    const currency = rows[0]?.currency ?? "AUD";
    const totalCents = rows.reduce((sum, row) => sum + row.amount, 0);
    const latest = rows
      .slice()
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
    const latestLine = latest ? ` Latest: ${latest.merchant ?? latest.category} ${latest.currency} ${(latest.amount / 100).toFixed(2)}.` : "";
    return `Expenses: ${currency} ${(totalCents / 100).toFixed(2)} this month across ${rows.length} item(s).${latestLine} No bank feed used.`;
  }

  private async getMonthlyExpenseSnapshot(): Promise<string> {
    const now = this.deps.now();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const rows = await recentExpensesBetween(this.deps.db, this.tenant(), from, now, 200);
    if (!rows.length) return "- No expenses logged this month.";
    const totalCents = rows.reduce((sum, row) => sum + row.amount, 0);
    const currency = rows[0]?.currency ?? "AUD";
    const byCategory = new Map<string, number>();
    for (const row of rows) byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + row.amount);
    const topCategories = [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, cents]) => `- ${category}: ${currency} ${(cents / 100).toFixed(2)}`)
      .join("\n");
    return [`- This month: ${currency} ${(totalCents / 100).toFixed(2)} across ${rows.length} expense(s).`, topCategories].join("\n");
  }

  private async formatFilesStatus(userPhone: string): Promise<string> {
    const rows = await recentMessages(this.deps.db, hashPhone(userPhone), 80);
    const documents = rows.filter((row) => row.mediaType === "document").slice(0, 5);
    const recent = documents.length
      ? documents.map((row, index) => {
          const metadata = (row.metadata ?? {}) as Record<string, unknown>;
          const filename = typeof metadata.filename === "string" ? metadata.filename : "document";
          const mimetype = typeof metadata.mimetype === "string" ? metadata.mimetype : "unknown type";
          return `${index + 1}. ${filename} (${mimetype})`;
        }).join("\n")
      : "No recent document uploads found in local history.";
    return [
      "Files/documents",
      "Ready now: upload text, CSV, JSON, Markdown, HTML, or selectable PDF files. I can summarize and extract key bill/admin details.",
      "Still needs setup: Drive/OneDrive browsing requires provider OAuth and a file picker.",
      `Recent local uploads:\n${recent}`,
    ].join("\n");
  }

  private async formatRemindersStatus(): Promise<string> {
    const rows = await listPendingReminders(this.deps.db, this.tenant(), this.deps.now(), 5);
    if (!rows.length) {
      return [
        "Reminders",
        "Clear: no upcoming WhatsApp reminders.",
        "Storage: NitsyClaw reminders. Delivery: WhatsApp self-chat.",
        "Try: remind me to call dentist tomorrow 9am",
      ].join("\n");
    }
    const reminders = rows
      .map((row, index) => `${index + 1}. ${row.text} - ${this.formatLocalDateTime(row.fireAt)}`)
      .join("\n");
    return [
      "Reminders",
      `Next: ${rows[0]!.text} at ${this.formatLocalDateTime(rows[0]!.fireAt)}`,
      `Storage: NitsyClaw reminders. Delivery: WhatsApp self-chat.`,
      `Upcoming:\n${reminders}`,
      "Try: remind me to call dentist tomorrow 9am",
    ].join("\n");
  }

  private async formatExpenseStatus(): Promise<string> {
    const now = this.deps.now();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const rows = await recentExpensesBetween(this.deps.db, this.tenant(), from, now, 200);
    if (rows.length === 0) {
      return [
        "Expenses",
        "Clear: no expenses found for this month.",
        "Currency: AUD by default unless you say USD, INR, or another supported currency.",
        "Source: local NitsyClaw expense log only. No bank feed is connected.",
        "Try: upload a bank CSV, send a receipt photo, or say spent $18.75 on Uber.",
      ].join("\n");
    }
    const totalCents = rows.reduce((sum, row) => sum + row.amount, 0);
    const currency = rows[0]?.currency ?? "AUD";
    const byCategory = new Map<string, number>();
    for (const row of rows) byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + row.amount);
    const categories = [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, cents]) => `- ${category}: ${currency} ${(cents / 100).toFixed(2)}`)
      .join("\n");
    return [
      "Expenses",
      `This month: ${currency} ${(totalCents / 100).toFixed(2)} across ${rows.length} expense(s).`,
      `Top categories:\n${categories}`,
      "Currency: AUD by default unless you say otherwise.",
      "Source: local NitsyClaw expense log only. No live bank feed is connected.",
    ].join("\n");
  }

  private formatSummaryStatus(): string {
    return [
      "Summaries",
      "Ready now:",
      "- bill summary: paste bill text",
      "- tidy note: paste messy notes",
      "- next steps: paste a messy plan",
      "- check before send: paste message",
      "- upload a selectable PDF/text document",
      "Still needs setup: OCR for scanned PDFs/photos and Drive/OneDrive browsing.",
    ].join("\n");
  }

  private formatAutonomousWorkReply(): string {
    return [
      "Safe work I can do without you:",
      "- Answer questions, handle voice notes, and keep WhatsApp replies moving.",
      "- Summarise uploaded text/selectable PDF documents and bills.",
      "- Log expenses from receipt photos, text, or bank/card CSV exports.",
      "- Show reminders, expenses, files, feature queue, and current capability status.",
      "- Draft replies, complaints, call scripts, packing lists, shopping lists, and decision notes.",
      "- Capture feature requests and bugs into the queue.",
      "- In the repo: add tests, fix safe bugs, run lint/typecheck/test/build/e2e/audit, update docs, and commit reversible changes.",
      "",
      "Needs small action from you:",
      "- Gmail/Outlook, Drive/OneDrive, Google Photos, Spotify, phone/SMS, and bank feeds need account/provider setup.",
      "- Anything that sends, calls, deletes, pays, books, or changes external data needs explicit confirmation.",
      "",
      "Useful commands:",
      "- status",
      "- canary test",
      "- local status",
      "- feature queue",
      "- what went wrong",
      "- expense summary",
      "- reminders",
      "- files",
    ].join("\n");
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

  private formatCsvExpenseImportReply(result: Awaited<ReturnType<typeof importExpensesFromCsv>>): string {
    const total = (result.totalAmountCents / 100).toFixed(2);
    const skipped = result.skipped.length
      ? `Skipped ${result.skipped.length} non-expense row${result.skipped.length === 1 ? "" : "s"}.`
      : "Skipped 0 rows.";
    return [
      `Imported ${result.importedCount} expense${result.importedCount === 1 ? "" : "s"} from CSV.`,
      `Total: ${result.currency} ${total}.`,
      skipped,
      "No bank connection was used.",
    ].join("\n");
  }

  private async handleTextExpenseShortcut(effectiveText: string, commandJob: CommandJob, persistedId: string): Promise<boolean> {
    const parsed = parseExpenseText(effectiveText);
    if (!parsed) {
      const reply = "I can log that expense, but I need the amount. Try: spent $18.40 at Chemist Warehouse for medicine.";
      await this.sendAndPersist(reply);
      await this.completeWhatsAppCommandJob(commandJob, reply);
      return true;
    }

    const category = parsed.category ?? categorizeExpense({ merchant: parsed.merchant, rawText: effectiveText });
    const expense = await insertExpense(this.deps.db, this.tenant(), {
      amount: parsed.amountCents,
      currency: parsed.currency,
      category,
      merchant: parsed.merchant,
      occurredAt: this.deps.now(),
      sourceMessageId: persistedId,
    });
    const amount = `${expense.currency} ${(expense.amount / 100).toFixed(2)}`;
    const lines = [
      `Expense logged: ${amount}`,
      `Category: ${expense.category}`,
      expense.merchant ? `Merchant: ${expense.merchant}` : undefined,
      `Saved: NitsyClaw expenses at ${this.formatLocalDateTime(expense.occurredAt)}.`,
      "Currency default is AUD unless you say USD, INR, or another supported currency.",
      "No bank connection was used.",
    ].filter((line): line is string => Boolean(line));
    const reply = lines.join("\n");
    await this.sendAndPersist(reply);
    await this.completeWhatsAppCommandJob(commandJob, reply);
    return true;
  }

  private async handleTextReminderShortcut(effectiveText: string, commandJob: CommandJob): Promise<boolean> {
    const planned = planReminder({
      text: effectiveText,
      now: this.deps.now(),
      timezone: this.deps.timezone,
    });
    if (!planned) {
      const reply = "I can set that reminder, but I need a time. Try: remind me to call Mukesh tomorrow at 10 am.";
      await this.sendAndPersist(reply);
      await this.completeWhatsAppCommandJob(commandJob, reply);
      return true;
    }

    const reminder = await insertReminder(this.deps.db, this.tenant(), {
      text: planned.text,
      fireAt: planned.fireAt,
      rrule: planned.rrule,
    });
    const when = new Intl.DateTimeFormat("en-AU", {
      timeZone: this.deps.timezone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(reminder.fireAt);
    const reply = [
      `Reminder set: ${reminder.text}`,
      `When: ${when}`,
      "Saved: NitsyClaw reminders. Delivery: WhatsApp self-chat.",
    ].join("\n");
    await this.sendAndPersist(reply);
    await this.completeWhatsAppCommandJob(commandJob, reply);
    return true;
  }

  private formatLocalDateTime(date: Date): string {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: this.deps.timezone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  }

  private formatHelpReply(): string {
    return formatWhatsAppHelpReply();
  }

  private async formatWhatsAppSelfTestReply(): Promise<string> {
    const now = this.deps.now();
    const [botRuntime, whatsappClient, whatsappSend, whatsappLoopGuard] = await Promise.all([
      getSystemHeartbeat(this.deps.db, "bot-runtime"),
      getSystemHeartbeat(this.deps.db, "whatsapp-client"),
      getSystemHeartbeat(this.deps.db, "whatsapp-send"),
      getSystemHeartbeat(this.deps.db, "whatsapp-loop-guard"),
    ]);
    const runtime = buildBotRuntimeMetadata(process.env, now);
    const deployedCommit = heartbeatMetadataText(botRuntime, "commitShort")
      ?? heartbeatMetadataText(botRuntime, "commit")
      ?? runtime.commitShort;
    const loopReason = heartbeatMetadataText(whatsappLoopGuard, "reason");
    const loopResetAt = heartbeatMetadataText(whatsappLoopGuard, "resetAt");
    const sendError = heartbeatMetadataText(whatsappSend, "error");

    const botRuntimeLine = heartbeatLine("Bot runtime", botRuntime, now, 30 * 24 * 60 * 60 * 1000);
    const whatsappClientLine = heartbeatLine("WhatsApp client", whatsappClient, now, 2 * 60 * 1000);
    const whatsappSendLine = heartbeatLine("WhatsApp send", whatsappSend, now, 10 * 60 * 1000, sendError ? `last error: ${sendError}` : undefined);
    const loopGuardLine = heartbeatLine(
      "Loop guard",
      whatsappLoopGuard,
      now,
      10 * 60 * 1000,
      loopReason ? `reason: ${loopReason}${loopResetAt ? `, resets ${loopResetAt}` : ""}` : undefined,
    );
    const needsAttention = classifyHeartbeat(whatsappClient, now, 2 * 60 * 1000) !== "ok" ||
      classifyHeartbeat(whatsappSend, now, 10 * 60 * 1000) !== "ok" ||
      Boolean(sendError || loopReason);

    return formatWhatsAppReplyShape({
      answer: needsAttention ? "Self test: needs attention" : "Self test: ready",
      state: `State: router ready, ${runtime.platform}, commit ${deployedCommit}, ${now.toISOString().slice(0, 16).replace("T", " ")}.`,
      details: [
        botRuntimeLine,
        whatsappClientLine,
        whatsappSendLine,
        loopGuardLine,
      ],
      next: needsAttention ? "what went wrong | resume whatsapp" : "status | proof test | proof details",
    });
  }

  private async recordCanaryPersistence(proof: string): Promise<{ ok: boolean; id?: string; error?: string }> {
    try {
      const row = await insertMessage(this.deps.db, {
        direction: "out",
        surface: "whatsapp",
        fromNumber: hashPhone(this.ownerPhone),
        body: encryptForStorage(`[canary:${proof}]`),
        metadata: { kind: "whatsapp-canary", proof },
      });
      const recent = await recentMessages(this.deps.db, hashPhone(this.ownerPhone), 25);
      return {
        ok: recent.some((message) => message.id === row.id),
        id: row.id,
      };
    } catch (error) {
      logBotError("[router] canary persistence check failed", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "unknown persistence error",
      };
    }
  }

  private async formatWhatsAppCanaryReply(detail = false): Promise<string> {
    const now = this.deps.now();
    const proof = `WA-${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 12)}`;
    const [persistence, botRuntime, whatsappClient, whatsappSend, whatsappLoopGuard] = await Promise.all([
      this.recordCanaryPersistence(proof),
      getSystemHeartbeat(this.deps.db, "bot-runtime"),
      getSystemHeartbeat(this.deps.db, "whatsapp-client"),
      getSystemHeartbeat(this.deps.db, "whatsapp-send"),
      getSystemHeartbeat(this.deps.db, "whatsapp-loop-guard"),
    ]);
    const runtime = buildBotRuntimeMetadata(process.env, now);
    const deployedCommit = heartbeatMetadataText(botRuntime, "commitShort")
      ?? heartbeatMetadataText(botRuntime, "commit")
      ?? runtime.commitShort;
    const loopReason = heartbeatMetadataText(whatsappLoopGuard, "reason");
    const loopResetAt = heartbeatMetadataText(whatsappLoopGuard, "resetAt");
    const sendError = heartbeatMetadataText(whatsappSend, "error");
    const persistenceLine = persistence.ok
      ? `Database marker: passed (${persistence.id?.slice(0, 8) ?? "recorded"})`
      : `Database marker: failed (${clipForWhatsApp(persistence.error ?? "not found after write", 120)})`;

    const botRuntimeLine = heartbeatLine("Bot runtime", botRuntime, now, 30 * 24 * 60 * 60 * 1000);
    const whatsappClientLine = heartbeatLine("WhatsApp client", whatsappClient, now, 2 * 60 * 1000);
    const whatsappSendLine = heartbeatLine(
      "WhatsApp send",
      whatsappSend,
      now,
      10 * 60 * 1000,
      sendError ? `last error: ${sendError}` : undefined,
    );
    const loopGuardLine = heartbeatLine(
      "Loop guard",
      whatsappLoopGuard,
      now,
      10 * 60 * 1000,
      loopReason ? `reason: ${loopReason}${loopResetAt ? `, resets ${loopResetAt}` : ""}` : undefined,
    );
    const needsAttention = !persistence.ok ||
      classifyHeartbeat(whatsappClient, now, 2 * 60 * 1000) !== "ok" ||
      classifyHeartbeat(whatsappSend, now, 10 * 60 * 1000) !== "ok" ||
      Boolean(sendError || loopReason);

    if (!detail) {
      return formatWhatsAppReplyShape({
        answer: needsAttention ? "WhatsApp proof: needs attention" : "WhatsApp proof: passed",
        state: `State: ${proof}, commit ${deployedCommit}, ${now.toISOString().slice(0, 16).replace("T", " ")}.`,
        details: [
          "Routing: passed.",
          "Delivery: passed if you can read this.",
          persistenceLine,
          whatsappClientLine,
          whatsappSendLine,
          loopGuardLine,
          "Provider setup: not tested here.",
        ],
        next: needsAttention ? "what went wrong | proof details" : "proof details for full diagnostics",
      });
    }

    return [
      "WhatsApp proof",
      "",
      `Proof: ${proof}`,
      `Time: ${now.toISOString().slice(0, 16).replace("T", " ")}`,
      `Version: commit ${deployedCommit}`,
      "",
      "Checks:",
      "- Inbound/routing: passed (this command reached the router)",
      "- Outbound delivery: passed if you can read this reply",
      `- ${persistenceLine}`,
      `- ${botRuntimeLine}`,
      `- ${whatsappClientLine}`,
      `- ${whatsappSendLine}`,
      `- ${loopGuardLine}`,
      "",
      persistence.ok
        ? "Database write/read marker passed."
        : "Reply path worked, but database persistence needs investigation.",
      "It does not test Gmail, Drive, bank feeds, phone/SMS sending, or other provider setup.",
      "",
      "If this looked slow, duplicated, or wrong, send: what went wrong",
    ].join("\n");
  }

  private async formatWhatsAppIncidentSummaryReply(): Promise<string> {
    const now = this.deps.now();
    const [whatsappClient, whatsappSend, whatsappLoopGuard, recentJobs] = await Promise.all([
      getSystemHeartbeat(this.deps.db, "whatsapp-client"),
      getSystemHeartbeat(this.deps.db, "whatsapp-send"),
      getSystemHeartbeat(this.deps.db, "whatsapp-loop-guard"),
      listRecentCommandJobs(this.deps.db, { source: "whatsapp", limit: 8 }),
    ]);
    const failedJobs = recentJobs.filter((job) => job.status === "failed" || job.status === "retrying").slice(0, 4);
    const blockedJobs = recentJobs.filter((job) => job.status === "needs_approval" || job.status === "needs_clarification").slice(0, 3);
    const loopReason = heartbeatMetadataText(whatsappLoopGuard, "reason");
    const loopResetAt = heartbeatMetadataText(whatsappLoopGuard, "resetAt");
    const sendError = heartbeatMetadataText(whatsappSend, "error");

    const clientLine = heartbeatLine("WhatsApp client", whatsappClient, now, 2 * 60 * 1000);
    const sendLine = heartbeatLine("WhatsApp send", whatsappSend, now, 10 * 60 * 1000, sendError ? `last error: ${sendError}` : undefined);
    const loopLine = heartbeatLine(
      "Loop guard",
      whatsappLoopGuard,
      now,
      10 * 60 * 1000,
      loopReason ? `reason: ${loopReason}${loopResetAt ? `, resets ${loopResetAt}` : ""}` : undefined,
    );

    const failureLines = failedJobs.length
      ? failedJobs.slice(0, 1).map((job) => `Recent failure: ${job.status} - ${clipForWhatsApp(job.command, 70)}${job.error ? ` (${clipForWhatsApp(job.error, 60)})` : ""}`)
      : ["Recent failure: none found."];
    const blockedLines = blockedJobs.length
      ? blockedJobs.slice(0, 1).map((job) => `Waiting on you: ${job.status} - ${clipForWhatsApp(job.command, 70)}`)
      : ["Waiting on you: none found."];

    return formatWhatsAppReplyShape({
      answer: loopReason || sendError ? "Incident check: action may be needed" : "Incident check: no active failure signal",
      state: "State: checked WhatsApp health, recent failures, and commands waiting on you.",
      details: [
        clientLine,
        sendLine,
        loopLine,
        ...failureLines,
        ...blockedLines,
      ],
      next: loopReason || sendError
        ? "self test | resume whatsapp | proof details"
        : "bug: <what happened>, if a reply still feels wrong",
    });
  }

  private async formatWhatsAppControlPlaneReply(): Promise<string> {
    const now = this.deps.now();
    const [
      botRuntime,
      whatsappClient,
      whatsappSend,
      whatsappLoopGuard,
      scheduler,
      recentJobs,
      pendingQueue,
      waitingApproval,
    ] = await Promise.all([
      getSystemHeartbeat(this.deps.db, "bot-runtime"),
      getSystemHeartbeat(this.deps.db, "whatsapp-client"),
      getSystemHeartbeat(this.deps.db, "whatsapp-send"),
      getSystemHeartbeat(this.deps.db, "whatsapp-loop-guard"),
      getSystemHeartbeat(this.deps.db, "bot-scheduler"),
      listRecentCommandJobs(this.deps.db, { source: "whatsapp", limit: 10 }),
      listPendingFeatureRequests(this.deps.db),
      getLatestPendingConfirmation(this.deps.db, this.tenant()),
    ]);

    const runtime = buildBotRuntimeMetadata(process.env, now);
    const deployedCommit = heartbeatMetadataText(botRuntime, "commitShort")
      ?? heartbeatMetadataText(botRuntime, "commit")
      ?? runtime.commitShort;
    const loopReason = heartbeatMetadataText(whatsappLoopGuard, "reason");
    const loopResetAt = heartbeatMetadataText(whatsappLoopGuard, "resetAt");
    const sendError = heartbeatMetadataText(whatsappSend, "error");
    const recentFailures = recentJobs.filter((job) => job.status === "failed" || job.status === "retrying");
    const waitingJobs = recentJobs.filter((job) => job.status === "needs_approval" || job.status === "needs_clarification");
    const queueSummary = summarizeFeatureQueueStatus({ pending: pendingQueue, limit: 3 });
    const nextQueue = queueSummary.recommendedNext ?? queueSummary.quickWins[0] ?? queueSummary.topPending[0];
    const needsAttention = classifyHeartbeat(whatsappClient, now, 2 * 60 * 1000) !== "ok" ||
      classifyHeartbeat(whatsappSend, now, 10 * 60 * 1000) !== "ok" ||
      Boolean(loopReason || sendError || recentFailures.length);

    return formatWhatsAppReplyShape({
      answer: needsAttention ? "Control plane: needs attention" : "Control plane: ready",
      state: `State: commit ${deployedCommit}, ${runtime.platform}, ${now.toISOString().slice(0, 16).replace("T", " ")}.`,
      details: [
        heartbeatLine("Bot runtime", botRuntime, now, 30 * 24 * 60 * 60 * 1000),
        heartbeatLine("WhatsApp client", whatsappClient, now, 2 * 60 * 1000),
        heartbeatLine("WhatsApp send", whatsappSend, now, 10 * 60 * 1000, sendError ? `last error: ${sendError}` : undefined),
        heartbeatLine(
          "Loop guard",
          whatsappLoopGuard,
          now,
          10 * 60 * 1000,
          loopReason ? `reason: ${loopReason}${loopResetAt ? `, resets ${loopResetAt}` : ""}` : undefined,
        ),
        heartbeatLine("Scheduler", scheduler, now, 3 * 60 * 1000),
        `Command jobs: ${recentFailures.length} recent failure(s), ${waitingJobs.length} waiting clarification/approval.`,
        `Approvals: ${waitingApproval ? `waiting (${waitingApproval.action})` : "none waiting"}.`,
        `Queue: ${queueSummary.pendingCount} pending; next ${nextQueue ? `${nextQueue.shortId} ${clipForWhatsApp(nextQueue.description, 72)}` : "none"}.`,
        "Dashboard: /command for work queue, /whatsapp-recovery for recovery signals.",
      ],
      next: needsAttention ? "what went wrong | proof details | resume whatsapp" : "proof test | feature queue | local status",
    });
  }

  private formatQueuedIntegrationReply(
    shortcut: NonNullable<ReturnType<typeof parseQueuedIntegrationShortcut>>,
    out: unknown,
  ): string {
    const result = (out ?? {}) as {
      queued?: boolean;
      id?: string;
      status?: string;
      instruction?: string;
      prepared?: boolean;
      recipient?: string;
      body?: string;
      nextSetup?: string;
      safetyBoundary?: string;
    };

    if (shortcut.toolName === "prepare_sms_draft") {
      return [
        `SMS draft for ${result.recipient ?? "recipient"}:`,
        result.body ?? "",
        "",
        result.instruction ?? "NitsyClaw has not sent it.",
        result.safetyBoundary,
        result.nextSetup,
      ].filter((line): line is string => Boolean(line)).join("\n");
    }

    return [
      `Setup request saved: ${shortcut.label}`,
      result.id ? `ID: ${result.id.slice(0, 8)}` : undefined,
      result.status ? `Status: ${result.status}` : undefined,
      "Needs setup before I can do the real action.",
      result.instruction,
      "I did not access any live external account.",
    ].filter((line): line is string => Boolean(line)).join("\n");
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

  private formatRepeatLastMessageReply(
    history: HistoryTurn[],
    shortcut: NonNullable<ReturnType<typeof parseRepeatLastMessageShortcut>>,
    currentText: string,
  ): string {
    const newestFirst = [...history].reverse();
    const candidates = newestFirst
      .map((turn) => ({ ...turn, content: turn.content.trim() }))
      .filter((turn) => turn.content && !isRepeatNoise(turn.content, currentText));

    const voiceTurn = candidates.find((turn) => {
      if (turn.role === "user" && turn.mediaType === "voice" && turn.content.length > 0) return true;
      return /^📝\s*Transcribed\./i.test(turn.content) || /^Transcribed\./i.test(turn.content);
    });
    const userTurn = candidates.find((turn) => turn.role === "user");
    const fallbackTurn = candidates[0];

    const selected = shortcut.preferVoice ? (voiceTurn ?? userTurn ?? fallbackTurn) : (userTurn ?? voiceTurn ?? fallbackTurn);
    if (!selected) {
      return "I could not find a previous message yet. Send it again and I will read it back.";
    }

    const cleaned = extractReadableLastMessage(selected.content);
    const label = /^📝?\s*Transcribed\./i.test(selected.content) || selected.mediaType === "voice"
      ? "Last voice transcript I have"
      : selected.role === "user"
        ? "Last message I have from you"
        : "Last reply I sent";
    return `${label}:\n${clipForWhatsApp(cleaned)}`;
  }

  async handle(msg: InboundMessage): Promise<void> {
    if (msg.from !== this.ownerPhone) return; // R2 — only owner
    const dedupeKey = `whatsapp:${msg.id}`;
    const existingCommandJob = await getCommandJobByDedupeKey(this.deps.db, dedupeKey);
    if (existingCommandJob && isGateReplay(existingCommandJob.status)) {
      await this.sendAndPersistBestEffort(formatCommandReceiptForWhatsApp(existingCommandJob.receiptText), "command gate replay");
      return;
    }
    if (existingCommandJob && isTerminalReplay(existingCommandJob.status)) return;
    if (!this.rememberExternalMessageId(msg.id)) return;

    const initialPrivateMode = parsePrivateModeInput(msg.body);
    if (initialPrivateMode) {
      let privateText = initialPrivateMode.text;
      if (msg.mediaType === "voice" && msg.downloadMedia) {
        try {
          const media = await msg.downloadMedia();
          privateText = await this.deps.transcriber.transcribe(media.data, media.mimetype);
        } catch (error) {
          await this.sendWithoutPersistence("Private mode is on, but I could not transcribe that voice note.");
          logBotError("[router] private voice transcription failed", error);
          return;
        }
      }
      const reply = await this.answerPrivateMode(privateText);
      await this.sendWithoutPersistence(reply);
      return;
    }

    // Load cross-surface history BEFORE persisting current turn so it isn't included.
    const history = await loadCrossSurfaceHistory(
      this.deps.db,
      hashPhone(this.ownerPhone),
      20,
    ).catch((e) => {
      logBotError("[router] history load failed", e);
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
    let commandJob = existingCommandJob ?? await this.createWhatsAppCommandJob(
      msg,
      persisted.id,
      buildWhatsAppCommandSummary(msg, effectiveText),
      msg.mediaType ? true : canAgentClarifySafely(effectiveText),
      msg.mediaType ? { maxAttempts: 1 } : {},
    );

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
        commandJob = await refreshCommandJobIntent(this.deps.db, commandJob.id, effectiveText, true);
        if (commandJob.status === "needs_approval" || commandJob.status === "needs_clarification") {
          await this.sendAndPersistBestEffort(formatCommandReceiptForWhatsApp(commandJob.receiptText), "voice command gate");
          return;
        }
      } catch (e) {
        await this.failWhatsAppCommandJob(commandJob, e);
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
          const reply = `💸 Logged ${out.currency} ${out.amount} (${out.category}) at ${out.merchant ?? "unknown"}`;
          await this.completeWhatsAppCommandJob(commandJob, reply);
          await this.sendAndPersistBestEffort(reply, "image receipt");
          return;
        }
        // Receipt extraction returned nothing useful — treat as general image.
        const description = await this.identifyImage(media.data, media.mimetype);
        const reply = `📸 I see: ${description}\n\nWhat would you like to do? Reply with: "save as memory", "set a reminder about this", "log expense ${out?.rawText ? `(${out.rawText})` : ""}", or just describe what you want.`;
        await this.completeWhatsAppCommandJob(commandJob, reply);
        await this.sendAndPersistBestEffort(reply, "image description");
      } catch (_imageError) {
        // Even receipt parsing crashed (vision API failure, etc.). Try general path.
        try {
          const media = await msg.downloadMedia();
          const description = await this.identifyImage(media.data, media.mimetype);
          const reply = `📸 I see: ${description}\n\nWhat would you like to do? Reply with: "save as memory", "set a reminder", or describe what you want.`;
          await this.completeWhatsAppCommandJob(commandJob, reply);
          await this.sendAndPersistBestEffort(reply, "image fallback description");
        } catch (e2) {
          await this.failWhatsAppCommandJob(commandJob, e2);
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
        if (media) {
          await updateMessageMetadata(this.deps.db, persisted.id, {
            masked: maskPhone(msg.from),
            filename: media.filename,
            mimetype: media.mimetype,
            byteLength: media.data.byteLength,
          });
        }
        const extracted = media
          ? await extractDocumentTextFromMedia({
              data: media.data,
              filename: media.filename,
              mimetype: media.mimetype,
            })
          : undefined;
        const extractedWarning = extracted && !extracted.supported ? extracted.reason : undefined;
        const documentText = [effectiveText, extracted?.text].filter((part) => part?.trim()).join("\n\n");
        if (media && extracted?.supported && isCsvUpload(media.filename, media.mimetype)) {
          const rawCsv = Buffer.from(media.data).toString("utf8").replace(/^\uFEFF/, "");
          const imported = await importExpensesFromCsv({
            csv: rawCsv,
            db: this.deps.db,
            now: this.deps.now(),
            defaultCurrency: process.env.DEFAULT_CURRENCY ?? "AUD",
            sourceMessageId: persisted.id,
          });
          if (imported.importedCount > 0) {
            const reply = this.formatCsvExpenseImportReply(imported);
            await this.completeWhatsAppCommandJob(commandJob, reply);
            await this.sendAndPersistBestEffort(reply, "csv expense import");
            return;
          }
        }
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
        await this.completeWhatsAppCommandJob(commandJob, reply);
        await this.sendAndPersistBestEffort(reply, "document intake");
      } catch (documentError) {
        await this.failWhatsAppCommandJob(commandJob, documentError);
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
        const reply = "That description is too short. Try: feature request: voice input on dashboard /chat using Web Speech API";
        await this.sendAndPersist(reply);
        await this.completeWhatsAppCommandJob(commandJob, reply);
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
        const reply = `✅ Queued! ID: ${row.id.slice(0, 8)}. Build agent picks it up at next run.`;
        await this.sendAndPersist(reply);
        await this.completeWhatsAppCommandJob(commandJob, reply);
      } catch (e) {
        await this.failWhatsAppCommandJob(commandJob, e);
        await this.sendPublicFailure("feature queue", "Couldn't queue that feature. I logged it; try again shortly.", e);
      }
      return;
    }

    const queuedIntegration = parseQueuedIntegrationShortcut(effectiveText);
    if (queuedIntegration) {
      try {
        const tool = this.registry.get(queuedIntegration.toolName);
        if (!tool) {
          const reply = `That integration rail is not available yet: ${queuedIntegration.label}. I did not access any external account.`;
          await this.sendAndPersist(reply);
          await this.completeWhatsAppCommandJob(commandJob, reply);
          return;
        }
        const out = await tool.handler(queuedIntegration.input, {
          userPhone: msg.from,
          now: this.deps.now(),
          timezone: this.deps.timezone,
          deps: this.deps,
        });
        const reply = this.formatQueuedIntegrationReply(queuedIntegration, out);
        await this.sendAndPersist(reply);
        await this.completeWhatsAppCommandJob(commandJob, reply);
      } catch (integrationError) {
        await this.failWhatsAppCommandJob(commandJob, integrationError);
        await this.sendPublicFailure("queued integration", "Couldn't queue that integration request. I logged it; try again shortly.", integrationError);
      }
      return;
    }

    const homeShortcut = parseHomeAssistantShortcut(effectiveText);
    if (homeShortcut) {
      try {
        const reply = this.formatHomeAssistantReply(homeShortcut);
        await this.sendAndPersist(reply);
        await this.completeWhatsAppCommandJob(commandJob, reply);
      } catch (homeShortcutError) {
        await this.failWhatsAppCommandJob(commandJob, homeShortcutError);
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
              {
                city: locationShortcut.city,
                region: locationShortcut.region,
                country: locationShortcut.country,
                timezone: locationShortcut.timezone,
                expiresHint: locationShortcut.expiresHint,
              },
              {
                userPhone: msg.from,
                now: this.deps.now(),
                timezone: this.deps.timezone,
                deps: this.deps,
              },
            )) as { location?: string; expiresHint?: string })
          : null;
        if (locationShortcut.continueAfterSave) {
          // Combined travel + weather requests should save context and still answer the actual question.
          // Example: "I'm in Sydney until tomorrow. What's the weather tomorrow?"
        } else {
          const reply = out?.expiresHint
            ? `Location updated: ${out.location} until ${out.expiresHint}.`
            : `Location updated: ${out?.location ?? locationShortcut.city}.`;
          await this.sendAndPersist(reply);
          await this.completeWhatsAppCommandJob(commandJob, reply);
          return;
        }
      } catch (locationError) {
        await this.failWhatsAppCommandJob(commandJob, locationError);
        await this.sendPublicFailure("location save", "Couldn't save that location. I logged it; try again shortly.", locationError);
        return;
      }
    }

    const locationStatusShortcut = parseLocationStatusShortcut(effectiveText);
    if (locationStatusShortcut) {
      const tool = this.registry.get("get_current_location");
      try {
        const out = tool
          ? ((await tool.handler(
              {},
              {
                userPhone: msg.from,
                now: this.deps.now(),
                timezone: this.deps.timezone,
                deps: this.deps,
              },
            )) as {
              location?: string;
              expiresAt?: string;
              expiresHint?: string;
              source?: string;
              timezone?: string;
              staleLocationIgnored?: { location?: string; expiredAt?: string; timezone?: string };
            })
          : null;
        const suffix = out?.expiresAt ? ` until ${out.expiresHint ?? out.expiresAt}` : "";
        const timezone = out?.timezone ? `\nTravel timezone: ${out.timezone}.` : "";
        const stale = out?.staleLocationIgnored?.location
          ? `\nIgnored expired travel location: ${out.staleLocationIgnored.location}.`
          : "";
        const reply = `Weather/default location: ${out?.location ?? "Melbourne, Victoria, Australia"}${suffix}.\nSource: ${out?.source ?? "profile_default"}.${timezone}${stale}`;
        await this.sendAndPersist(reply);
        await this.completeWhatsAppCommandJob(commandJob, reply);
      } catch (locationStatusError) {
        await this.failWhatsAppCommandJob(commandJob, locationStatusError);
        await this.sendPublicFailure("location status", "Couldn't check the saved location. I logged it; try again shortly.", locationStatusError);
      }
      return;
    }

    const peopleMemory = parsePeopleMemoryShortcut(effectiveText);
    if (peopleMemory) {
      try {
        const reply = peopleMemory.kind === "list"
          ? await this.formatPeopleMemoryListReply(msg.from)
          : await this.savePeopleMemoryFromShortcut(peopleMemory.input!, msg.from);
        await this.sendAndPersist(reply);
        await this.completeWhatsAppCommandJob(commandJob, reply);
      } catch (peopleMemoryError) {
        await this.failWhatsAppCommandJob(commandJob, peopleMemoryError);
        await this.sendPublicFailure("people memory", "Couldn't update people memory. I logged it; try again shortly.", peopleMemoryError);
      }
      return;
    }

    const repeatLastMessage = parseRepeatLastMessageShortcut(effectiveText);
    if (repeatLastMessage) {
      const reply = this.formatRepeatLastMessageReply(history, repeatLastMessage, effectiveText);
      await this.sendAndPersist(reply);
      await this.completeWhatsAppCommandJob(commandJob, reply);
      return;
    }

    const helpShortcut = parseHelpShortcut(effectiveText);
    if (helpShortcut) {
      const reply = this.formatHelpReply();
      await this.sendAndPersist(reply);
      await this.completeWhatsAppCommandJob(commandJob, reply);
      return;
    }

    const capabilityStatus = parseCapabilityStatusShortcut(effectiveText);
    if (capabilityStatus) {
      try {
        await this.sendCapabilityStatus(5);
        await this.completeWhatsAppCommandJob(commandJob, "NitsyClaw status sent.");
      } catch (statusError) {
        await this.failWhatsAppCommandJob(commandJob, statusError);
        await this.sendPublicFailure("capability status", "Couldn't load the current status. I logged it; try again shortly.", statusError);
      }
      return;
    }

    const pendingFeatureDevelopment = parsePendingFeatureDevelopmentShortcut(effectiveText);
    if (pendingFeatureDevelopment) {
      try {
        const providerReadiness = await this.getProviderReadiness();
        const reply = formatWhatsAppPendingFeatureDevelopmentPlan(providerReadiness);
        await this.sendAndPersist(reply);
        await this.completeWhatsAppCommandJob(commandJob, reply);
      } catch (planError) {
        await this.failWhatsAppCommandJob(commandJob, planError);
        await this.sendPublicFailure("pending feature plan", "Couldn't build the pending-feature plan. I logged it; try again shortly.", planError);
      }
      return;
    }

    const commandContract = parseCommandContractShortcut(effectiveText);
    if (commandContract) {
      const reply = formatWhatsAppCommandContractReply();
      await this.sendAndPersist(reply);
      await this.completeWhatsAppCommandJob(commandJob, reply);
      return;
    }

    const cantDoGuard = parseCantDoGuardShortcut(effectiveText);
    if (cantDoGuard) {
      try {
        const providerReadiness = await this.getProviderReadiness();
        const reply = formatWhatsAppCantDoGuard(providerReadiness);
        await this.sendAndPersist(reply);
        await this.completeWhatsAppCommandJob(commandJob, reply);
      } catch (guardError) {
        await this.failWhatsAppCommandJob(commandJob, guardError);
        await this.sendPublicFailure("can't-do guard", "Couldn't load the safety boundaries. I logged it; try again shortly.", guardError);
      }
      return;
    }

    const selfTest = parseWhatsAppSelfTestShortcut(effectiveText);
    if (selfTest) {
      try {
        const reply = await this.formatWhatsAppSelfTestReply();
        await this.sendAndPersist(reply);
        await this.completeWhatsAppCommandJob(commandJob, reply);
      } catch (selfTestError) {
        await this.failWhatsAppCommandJob(commandJob, selfTestError);
        await this.sendPublicFailure("whatsapp self-test", "Couldn't run the WhatsApp self-test. I logged it; try again shortly.", selfTestError);
      }
      return;
    }

    const incidentSummary = parseWhatsAppIncidentSummaryShortcut(effectiveText);
    if (incidentSummary) {
      try {
        const reply = await this.formatWhatsAppIncidentSummaryReply();
        await this.sendAndPersist(reply);
        await this.completeWhatsAppCommandJob(commandJob, reply);
      } catch (incidentError) {
        await this.failWhatsAppCommandJob(commandJob, incidentError);
        await this.sendPublicFailure("whatsapp incident summary", "Couldn't load the incident summary. I logged it; try again shortly.", incidentError);
      }
      return;
    }

    const controlPlane = parseWhatsAppControlPlaneShortcut(effectiveText);
    if (controlPlane) {
      try {
        const reply = await this.formatWhatsAppControlPlaneReply();
        await this.sendAndPersist(reply);
        await this.completeWhatsAppCommandJob(commandJob, reply);
      } catch (controlPlaneError) {
        await this.failWhatsAppCommandJob(commandJob, controlPlaneError);
        await this.sendPublicFailure("whatsapp control plane", "Couldn't load the WhatsApp control plane. I logged it; try again shortly.", controlPlaneError);
      }
      return;
    }

    const canary = parseWhatsAppCanaryShortcut(effectiveText);
    if (canary) {
      const reply = await this.formatWhatsAppCanaryReply(canary.detail);
      await this.sendAndPersist(reply);
      await this.completeWhatsAppCommandJob(commandJob, reply);
      return;
    }

    const autonomousWork = parseAutonomousWorkShortcut(effectiveText);
    if (autonomousWork) {
      const reply = this.formatAutonomousWorkReply();
      await this.sendAndPersist(reply);
      await this.completeWhatsAppCommandJob(commandJob, reply);
      return;
    }

    const dailyStatus = parseDailyStatusShortcut(effectiveText);
    if (dailyStatus) {
      try {
        const reply = await this.formatDailyStatusReply(msg.from);
        await this.sendAndPersist(reply);
        await this.completeWhatsAppCommandJob(commandJob, reply);
      } catch (dailyStatusError) {
        await this.failWhatsAppCommandJob(commandJob, dailyStatusError);
        await this.sendPublicFailure("daily status", "Couldn't load daily status. I logged it; try again shortly.", dailyStatusError);
      }
      return;
    }

    const nightlyHealth = parseNightlyHealthShortcut(effectiveText);
    if (nightlyHealth) {
      try {
        const report = await buildNightlyWhatsAppHealthReport(this.deps);
        await this.sendAndPersist(report.body);
        await this.completeWhatsAppCommandJob(commandJob, report.body);
      } catch (nightlyHealthError) {
        await this.failWhatsAppCommandJob(commandJob, nightlyHealthError);
        await this.sendPublicFailure("nightly health", "Couldn't build the WhatsApp health report. I logged it; try again shortly.", nightlyHealthError);
      }
      return;
    }

    const localStatus = parseLocalStatusShortcut(effectiveText);
    if (localStatus) {
      try {
        const reply = await this.formatLocalStatusReply(localStatus.kind, msg.from);
        await this.sendAndPersist(reply);
        await this.completeWhatsAppCommandJob(commandJob, reply);
      } catch (localStatusError) {
        await this.failWhatsAppCommandJob(commandJob, localStatusError);
        await this.sendPublicFailure("local status", "Couldn't load local status. I logged it; try again shortly.", localStatusError);
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
        const reply = `Logged as bug ${row.id.slice(0, 8)}. I captured it as existing broken behavior, not a new feature.`;
        await this.sendAndPersist(reply);
        await this.completeWhatsAppCommandJob(commandJob, reply);
      } catch (bugError) {
        await this.failWhatsAppCommandJob(commandJob, bugError);
        await this.sendPublicFailure("bug queue", "Couldn't log that bug. I logged it; try again shortly.", bugError);
      }
      return;
    }

    const featureQueue = parseFeatureQueueShortcut(effectiveText);
    if (featureQueue) {
      try {
        await this.sendFeatureQueueStatus(featureQueue.limit);
        await this.completeWhatsAppCommandJob(commandJob, "Feature queue status sent.");
      } catch (queueError) {
        await this.failWhatsAppCommandJob(commandJob, queueError);
        await this.sendPublicFailure("feature queue load", "Couldn't load the feature queue. I logged it; try again shortly.", queueError);
      }
      return;
    }

    const buildAgent = parseBuildAgentShortcut(effectiveText);
    if (buildAgent) {
      try {
        const rows = await listPendingFeatureRequests(this.deps.db);
        if (rows.length === 0) {
          const reply = "Build agent checked the queue. No pending features or bugs.";
          await this.sendAndPersist(reply);
          await this.completeWhatsAppCommandJob(commandJob, reply);
          return;
        }

        const preview = rows
          .slice(0, 5)
          .map((row, index) => `${index + 1}. ${row.id.slice(0, 8)} ${row.description.slice(0, 80)}`)
          .join("\n");

        if (buildAgent.dryRun) {
          const reply = `Build queue preview (${rows.length} pending):\n${preview}`;
          await this.sendAndPersist(reply);
          await this.completeWhatsAppCommandJob(commandJob, reply);
          return;
        }

        const reply = `Build agent checked ${rows.length} pending item(s). I will post the queue summary here. Implementation happens through the local operator workflow and only counts as shipped after tests and commit.`;
        await this.sendAndPersist(reply);
        await runDailyBuildAgent(this.deps, this.ownerPhone);
        await this.completeWhatsAppCommandJob(commandJob, reply);
      } catch (e) {
        await this.failWhatsAppCommandJob(commandJob, e);
        await this.sendPublicFailure("build agent run", "Build agent run failed. I logged it; try again shortly.", e);
      }
      return;
    }

    // 3. Deterministic common commands before the model loop.
    const intent = detectIntent(effectiveText);
    if (intent === "log_expense") {
      try {
        if (await this.handleTextExpenseShortcut(effectiveText, commandJob, persisted.id)) return;
      } catch (expenseError) {
        await this.failWhatsAppCommandJob(commandJob, expenseError);
        await this.sendPublicFailure("text expense", "Couldn't log that expense. I logged the error; try again shortly.", expenseError);
        return;
      }
    }
    if (intent === "set_reminder") {
      try {
        if (await this.handleTextReminderShortcut(effectiveText, commandJob)) return;
      } catch (reminderError) {
        await this.failWhatsAppCommandJob(commandJob, reminderError);
        await this.sendPublicFailure("text reminder", "Couldn't set that reminder. I logged the error; try again shortly.", reminderError);
        return;
      }
    }

    // 4. Confirmation y/n short-circuit (no LLM needed).
    if (intent === "confirmation") {
      const confirmationTool = this.registry.get("resolve_confirmation");
      const confirmationId = parseConfirmationId(effectiveText);
      const reply = /^(y|yes|approve|approved|confirm|confirmed|ok|okay)\b/i.test(effectiveText.trim())
        ? "yes"
        : "no";
      let canResolveConfirmation = true;
      if (!confirmationId) {
        const latest = await getLatestPendingConfirmation(this.deps.db, this.tenant());
        if (!latest) {
          canResolveConfirmation = false;
        } else if (confirmationNeedsExplicitId(latest.action)) {
          const response = `${confirmationActionLabel(latest.action)} need the confirmation id. Reply ${reply} ${latest.id} to resolve this safely.`;
          await this.sendAndPersist(response);
          await this.completeWhatsAppCommandJob(commandJob, response);
          return;
        }
      }
      const out = canResolveConfirmation && confirmationTool
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
          const response = `Done. Created Spotify playlist "${resolved.playlist.name ?? "playlist"}" with ${resolved.playlist.added ?? 0} tracks.\n${resolved.playlist.url ?? ""}`.trim();
          await this.completeWhatsAppCommandJob(commandJob, response);
          await this.sendAndPersist(response);
        } else if (resolved.link) {
          const response = `Confirmation: ${resolved.decision}\n${resolved.link}`;
          await this.completeWhatsAppCommandJob(commandJob, response);
          await this.sendAndPersist(response);
        } else if (resolved.action === "email_create_draft") {
          const response = resolved.draftCreated
            ? `Email draft created in ${resolved.provider ?? "mailbox"}.\nDraft id: ${resolved.draftId ?? "unknown"}`
            : `Email draft not created yet: ${resolved.unavailable ?? "email adapter unavailable"}`;
          await this.completeWhatsAppCommandJob(commandJob, response);
          await this.sendAndPersist(response);
        } else {
          const response = `Confirmation: ${resolved.decision ?? "resolved"}`;
          await this.completeWhatsAppCommandJob(commandJob, response);
          await this.sendAndPersist(response);
        }
        return;
      }
    }

    // 5. Default — record the command first, then run the agent loop.
    const shouldAppendFeatureQueueStatus = mentionsFeatureQueueStatus(effectiveText);
    if (shouldSendImmediateReceipt(commandJob)) {
      await this.sendAndPersist(formatCommandReceiptForWhatsApp(commandJob.receiptText));
    }
    if (commandJob.status === "needs_approval" || commandJob.status === "needs_clarification") return;

    try {
      await markCommandJobWorking(this.deps.db, commandJob.id);
      const promptProfile = await resolvePromptProfileFromContext(this.deps.db, {
        userPhone: msg.from,
        now: this.deps.now(),
        fallback: this.deps.profile,
      }).catch(() => this.deps.profile);
      const agentDeps = {
        ...this.deps,
        profile: promptProfile,
        timezone: promptProfile?.timezone ?? this.deps.timezone,
      };
      const result = await runAgent({
        userPhone: msg.from,
        userMessage: effectiveText,
        history,
        systemPrompt: buildSystemPrompt({ surface: "whatsapp", profile: promptProfile }),
        registry: this.registry,
        deps: agentDeps,
      });
      // The agent should have already replied via reply_to_user; only echo if it didn't.
      const replyToUserCall = result.toolCalls.find((c) => c.name === "reply_to_user" && c.success);
      let deliveredText = "";
      if (replyToUserCall) {
        // The tool already sent via WhatsApp; persist the reply for cross-surface history.
        const text = sanitizeUserFacingReply((replyToUserCall.input as { text?: string })?.text ?? "");
        deliveredText = text;
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
            logBotError("[router] failed to persist reply_to_user outbound", e);
          }
          notifyAll(text, { title: "NitsyClaw replied", priority: "default" }).catch(() => {});
        }
      } else if (result.finalText.trim()) {
        deliveredText = result.finalText;
        await this.sendAndPersist(result.finalText);
      }
      if (shouldAppendFeatureQueueStatus) {
        try {
          await this.sendFeatureQueueStatus(5);
          deliveredText = [deliveredText.trim(), "Feature queue status sent."].filter(Boolean).join("\n\n");
        } catch (queueError) {
          await this.sendPublicFailure("feature queue load", "Couldn't load the feature queue. I logged it; try again shortly.", queueError);
        }
      }
      await completeCommandJob(this.deps.db, commandJob.id, deliveredText.trim() || "Done.");
    } catch (e) {
      await recordCommandJobFailure(this.deps.db, commandJob.id, e);
      throw e;
    }
  }

  private rememberExternalMessageId(id: string): boolean {
    if (!id.trim()) return true;
    if (this.seenExternalMessageIds.has(id)) return false;
    this.seenExternalMessageIds.add(id);
    this.seenExternalMessageOrder.push(id);
    while (this.seenExternalMessageOrder.length > 500) {
      const oldest = this.seenExternalMessageOrder.shift();
      if (oldest) this.seenExternalMessageIds.delete(oldest);
    }
    return true;
  }

  private async savePeopleMemoryFromShortcut(
    input: {
      name: string;
      relationship?: string;
      birthday?: string;
      preferredChannel?: string;
      lastInteraction?: string;
      followUp?: string;
    },
    userPhone: string,
  ): Promise<string> {
    const tool = this.registry.get("save_people_memory");
    if (!tool) return "People memory is not available in this runtime.";
    const out = await tool.handler(
      { ...input, source: "whatsapp" },
      {
        userPhone,
        now: this.deps.now(),
        timezone: this.deps.timezone,
        deps: this.deps,
      },
    ) as {
      name?: string;
      relationship?: string;
      birthday?: string;
      preferredChannel?: string;
      lastInteraction?: string;
      followUp?: string;
    };
    return [
      `People memory saved: ${out.name ?? input.name}`,
      out.relationship ? `Relationship: ${out.relationship}` : undefined,
      out.birthday ? `Birthday: ${out.birthday}` : undefined,
      `Channel: ${out.preferredChannel ?? "ask before contacting"}`,
      out.lastInteraction ? `Last: ${out.lastInteraction}` : undefined,
      out.followUp ? `Follow-up: ${out.followUp}` : "Follow-up: none",
      "Safety: I will draft before contacting anyone.",
    ].filter((line): line is string => Boolean(line)).join("\n");
  }

  private async formatPeopleMemoryListReply(userPhone: string): Promise<string> {
    const tool = this.registry.get("list_people_memory");
    if (!tool) return "People memory is not available in this runtime.";
    const out = await tool.handler(
      { limit: 8 },
      {
        userPhone,
        now: this.deps.now(),
        timezone: this.deps.timezone,
        deps: this.deps,
      },
    ) as {
      people?: Array<{
        name?: string;
        relationship?: string;
        birthday?: string;
        preferredChannel?: string;
        followUp?: string;
      }>;
    };
    const people = out.people ?? [];
    if (people.length === 0) {
      return "People memory is empty.\nTry: person: Maya | neighbour | birthday: 5 May | channel: WhatsApp | follow up: ask about school pickup";
    }
    const lines = people.map((person, index) => {
      const details = [
        person.relationship,
        person.birthday ? `birthday ${person.birthday}` : undefined,
        person.preferredChannel ? `channel ${person.preferredChannel}` : undefined,
        person.followUp ? `follow up ${person.followUp}` : undefined,
      ].filter(Boolean).join("; ");
      return `${index + 1}. ${person.name ?? "Unknown"}${details ? `: ${details}` : ""}`;
    });
    return `People memory\n${lines.join("\n")}\nSafety: I will draft before contacting anyone.`;
  }

}

function parseConfirmationId(text: string): string | undefined {
  return text.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i)?.[0];
}

function heartbeatLine(
  label: string,
  heartbeat: SystemHeartbeat | null,
  now: Date,
  staleAfterMs: number,
  detail?: string,
): string {
  const freshness = classifyHeartbeat(heartbeat, now, staleAfterMs);
  if (!heartbeat) return `${label}: missing`;
  const ageSeconds = Math.max(0, Math.round((now.getTime() - heartbeat.lastSeenAt.getTime()) / 1000));
  const suffix = detail ? ` - ${detail}` : "";
  return `${label}: ${heartbeat.status} (${freshness}, ${ageSeconds}s ago)${suffix}`;
}

function heartbeatMetadataText(heartbeat: SystemHeartbeat | null, key: string): string | null {
  const metadata = heartbeat?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return null;
  return String(value).slice(0, 160);
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

function isTerminalReplay(status: CommandJob["status"]): boolean {
  return status === "done" || status === "failed";
}

function isGateReplay(status: CommandJob["status"]): boolean {
  return status === "needs_approval" || status === "needs_clarification";
}

function shouldSendImmediateReceipt(job: CommandJob): boolean {
  if (job.status === "needs_approval" || job.status === "needs_clarification") return true;
  return false;
}

function formatCommandReceiptForWhatsApp(receiptText: string): string {
  return receiptText.replace(/^Saved\.\s+/i, "");
}

function buildWhatsAppCommandSummary(msg: InboundMessage, text: string): string {
  const trimmed = text.trim();
  if (trimmed) return trimmed;
  if (msg.mediaType === "voice") return "[WhatsApp voice note]";
  if (msg.mediaType === "image") return "[WhatsApp image]";
  if (msg.mediaType === "document") return "[WhatsApp document]";
  return "[WhatsApp message]";
}

function isCsvUpload(filename?: string, mimetype?: string): boolean {
  const type = mimetype?.split(";")[0]?.trim().toLowerCase();
  return type === "text/csv" ||
    type === "application/csv" ||
    type === "application/vnd.ms-excel" ||
    /\.csv$/i.test(filename ?? "");
}

function extractReadableLastMessage(content: string): string {
  return content
    .replace(/^📝\s*Transcribed\.\s*I will reply in English\.\s*/i, "")
    .replace(/^Transcribed\.\s*I will reply in English\.\s*/i, "")
    .trim();
}

function isRepeatNoise(content: string, currentText: string): boolean {
  const normalized = normalizeForRepeat(content);
  if (!normalized) return true;
  if (normalized === normalizeForRepeat(currentText)) return true;
  if (/^(yes|yep|yeah|approved|approve|confirm|confirmed|ok|okay|no|thanks|thank you)$/.test(normalized)) return true;
  return parseRepeatLastMessageShortcut(content) !== null;
}

function normalizeForRepeat(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/g, "").trim();
}

function clipForWhatsApp(value: string, max = 1200): string {
  const clean = value.trim();
  return clean.length > max ? `${clean.slice(0, max - 20).trim()}...` : clean;
}

