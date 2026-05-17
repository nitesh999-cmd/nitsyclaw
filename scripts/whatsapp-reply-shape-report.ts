import { formatWhatsAppHelpReply } from "../apps/bot/src/whatsapp-capabilities.js";
import { formatWhatsAppReplyShape, whatsappReplyMetrics } from "../apps/bot/src/whatsapp-reply-format.js";
import {
  formatFeatureQueueStatusForWhatsApp,
  summarizeFeatureQueueStatus,
} from "../packages/shared/src/features/feature-queue-status.js";

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
    maxLines: 18,
    maxChars: 950,
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
    maxLines: 9,
    maxChars: 900,
  },
  {
    name: "self test",
    reply: [
      "NitsyClaw self-test",
      "",
      "Router: ready at 2026-05-16 09:00",
      "Runtime: railway, commit abc1234",
      "Bot runtime: ok",
      "WhatsApp client: ok",
      "WhatsApp send: ok",
      "Loop guard: ok",
      "",
      "If WhatsApp feels stuck, send: resume whatsapp",
      "For features, send: status",
    ].join("\n"),
    maxLines: 14,
    maxChars: 900,
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

if (failed) {
  process.exitCode = 1;
}
