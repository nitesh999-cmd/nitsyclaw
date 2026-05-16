import { formatWhatsAppHelpReply } from "../apps/bot/src/whatsapp-capabilities.js";
import { whatsappReplyMetrics } from "../apps/bot/src/whatsapp-reply-format.js";
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
    name: "feature queue",
    reply: featureQueue,
    maxLines: 9,
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

if (failed) {
  process.exitCode = 1;
}
