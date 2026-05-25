import {
  formatWhatsAppHelpReply,
  formatWhatsAppPendingFeatureDevelopmentPlan,
} from "../apps/bot/src/whatsapp-capabilities.js";
import { formatWhatsAppReplyShape, whatsappReplyMetrics } from "../apps/bot/src/whatsapp-reply-format.js";
import {
  formatFeatureQueueStatusForWhatsApp,
  summarizeFeatureQueueStatus,
} from "../packages/shared/src/features/feature-queue-status.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

interface ReplyBudget {
  name: string;
  reply: string;
  maxLines: number;
  maxChars: number;
}

const now = new Date("2026-05-16T09:00:00Z");

const featureQueue = formatFeatureQueueStatusForWhatsApp(summarizeFeatureQueueStatus({
  pending: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      description: "Read and send emails on behalf of the user via Gmail and Outlook",
      type: "feature",
      severity: null,
      size: "M",
      source: "whatsapp",
      implementationNotes: null,
      createdAt: now,
      completedAt: null,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      description: "Improve dashboard mobile navigation labels",
      type: "feature",
      severity: null,
      size: "S",
      source: "dashboard",
      implementationNotes: null,
      createdAt: now,
      completedAt: null,
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      description: "Spotify full assistant",
      type: "feature",
      severity: null,
      size: "M",
      source: "whatsapp",
      implementationNotes: null,
      createdAt: now,
      completedAt: null,
    },
  ],
  completed: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      description: "Compact WhatsApp help menu",
      type: "feature",
      severity: null,
      size: "S",
      source: "whatsapp",
      implementationNotes: "Committed and deployed.",
      createdAt: now,
      completedAt: now,
    },
  ],
  limit: 5,
}));

const replies: ReplyBudget[] = [
  {
    name: "what can you do",
    reply: formatWhatsAppHelpReply(),
    maxLines: 13,
    maxChars: 900,
  },
  {
    name: "local status",
    reply: formatWhatsAppReplyShape({
      answer: "Local status: ready",
      state: "State: checked local files, reminders, expenses, and summary tools. No external accounts used.",
      details: [
        "Files: agl-bill.txt.",
        "Reminders: call dentist.",
        "Expenses: AUD 18.75 this month across 1 item(s).",
        "Summaries: bill summary, tidy note, next steps, check before send.",
      ],
      next: "files | reminders | expense summary | bill summary: <text>",
    }),
    maxLines: 10,
    maxChars: 800,
  },
  {
    name: "feature queue",
    reply: featureQueue,
    maxLines: 8,
    maxChars: 780,
  },
  {
    name: "what went wrong",
    reply: formatWhatsAppReplyShape({
      answer: "Incident check: action may be needed",
      state: "State: checked WhatsApp health, recent failures, and commands waiting on you.",
      details: [
        "WhatsApp client: ok",
        "WhatsApp send: fail - last error: temporary WhatsApp send failure",
        "Loop guard: cooldown - reason: send burst",
        "Recent failure: failed - send message to John",
        "Waiting on you: needs_approval - draft SMS to John",
      ],
      next: "self test | resume whatsapp | proof details",
    }),
    maxLines: 9,
    maxChars: 900,
  },
  {
    name: "self test",
    reply: formatWhatsAppReplyShape({
      answer: "Self test: ready",
      state: "State: router ready, railway, commit abc1234, 2026-05-16 09:00.",
      details: [
        "Bot runtime: ok",
        "WhatsApp client: ok",
        "WhatsApp send: ok",
        "Loop guard: ok",
      ],
      next: "status | proof test | proof details",
    }),
    maxLines: 9,
    maxChars: 700,
  },
  {
    name: "proof test",
    reply: formatWhatsAppReplyShape({
      answer: "WhatsApp proof: passed",
      state: "State: WA-202605160900, commit abc1234, 2026-05-16 09:00.",
      details: [
        "Routing: passed.",
        "Delivery: passed if you can read this.",
        "Database marker: passed (12345678)",
        "WhatsApp client: ok",
        "WhatsApp send: ok",
        "Loop guard: ok",
        "Provider setup: not tested here.",
      ],
      next: "proof details for full diagnostics",
    }),
    maxLines: 12,
    maxChars: 900,
  },
  {
    name: "proof details",
    reply: [
      "WhatsApp proof",
      "",
      "Proof: WA-202605160900",
      "Time: 2026-05-16 09:00",
      "Version: commit abc1234",
      "",
      "Checks:",
      "- Inbound/routing: passed (this command reached the router)",
      "- Outbound delivery: passed if you can read this reply",
      "- Database marker: passed (12345678)",
      "- Bot runtime: ok",
      "- WhatsApp client: ok",
      "- WhatsApp send: ok",
      "- Loop guard: ok",
      "",
      "Database write/read marker passed.",
      "It does not test Gmail, Drive, bank feeds, phone/SMS sending, or other provider setup.",
      "",
      "If this looked slow, duplicated, or wrong, send: what went wrong",
    ].join("\n"),
    maxLines: 22,
    maxChars: 1400,
  },
  {
    name: "demo checklist",
    reply: formatWhatsAppReplyShape({
      answer: "Demo checklist: run these in WhatsApp.",
      state: "Goal: prove the life-admin spine works before more feature build.",
      details: [
        "1. proof test",
        "2. bill summary: AGL bill $240 due 18 May ref 12345",
        "3. I spent $18.40 at Chemist Warehouse for medicine",
        "4. Remind me to pay AGL on 17 May at 9 am",
        "5. weekly admin digest",
        "6. what went wrong",
      ],
      next: "If all pass, validate with a real bill/receipt. If one fails, send proof details.",
    }),
    maxLines: 12,
    maxChars: 900,
  },
  {
    name: "start demo",
    reply: formatWhatsAppReplyShape({
      answer: "Demo session started. Run these in WhatsApp.",
      state: "Results will use commands after this marker.",
      details: [
        "1. proof test",
        "2. bill summary: AGL bill $240 due 18 May ref 12345",
        "3. I spent $18.40 at Chemist Warehouse for medicine",
        "4. Remind me to pay AGL on 17 May at 9 am",
        "5. weekly admin digest",
        "6. what went wrong",
      ],
      next: "If all pass, validate with a real bill/receipt. If one fails, send proof details.",
    }),
    maxLines: 12,
    maxChars: 900,
  },
  {
    name: "demo results",
    reply: formatWhatsAppReplyShape({
      answer: "Demo results: 4/6 passed.",
      state: "1 need attention; 1 not checked.",
      details: [
        "Proof: passed",
        "Bill: passed",
        "Expense: passed",
        "Reminder: passed",
        "Weekly: not checked",
        "Incident: needs attention: recent send failure",
      ],
      next: "Send proof details, then fix the failing step.",
    }),
    maxLines: 12,
    maxChars: 900,
  },
  {
    name: "pending build plan",
    reply: formatWhatsAppPendingFeatureDevelopmentPlan(),
    maxLines: 12,
    maxChars: 900,
  },
];

let failed = false;

console.log("WhatsApp reply shape report");
console.log("command | lines | chars | budget | result");
for (const item of replies) {
  const metrics = whatsappReplyMetrics(item.reply);
  const ok = metrics.lines <= item.maxLines && metrics.chars <= item.maxChars;
  if (!ok) failed = true;
  console.log(`${item.name} | ${metrics.lines} | ${metrics.chars} | ${item.maxLines}/${item.maxChars} | ${ok ? "pass" : "fail"}`);
}

if (process.argv.includes("--write-snapshots")) {
  const snapshotPath = "docs/whatsapp-reply-snapshots.md";
  mkdirSync(dirname(snapshotPath), { recursive: true });
  const body = [
    "# WhatsApp Reply Snapshots",
    "",
    "Generated by `pnpm run whatsapp:reply-snapshots`.",
    "These are representative deterministic replies used by the reply budget gate.",
    "",
    ...replies.flatMap((item) => {
      const metrics = whatsappReplyMetrics(item.reply);
      return [
        `## ${item.name}`,
        "",
        `Budget: ${metrics.lines}/${item.maxLines} lines, ${metrics.chars}/${item.maxChars} chars.`,
        "",
        "```text",
        item.reply,
        "```",
        "",
      ];
    }),
  ].join("\n");
  writeFileSync(snapshotPath, `${body}\n`, "utf8");
  console.log(`Wrote ${snapshotPath}`);
}

if (failed) {
  process.exitCode = 1;
}
