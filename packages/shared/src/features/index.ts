// Each P0 feature exports a `register(registry)` that wires its tools.
// The bot worker calls registerAllFeatures({surface}) once at startup.
// Surface is needed by surface-aware tools (e.g. request_feature tags
// the originating surface for the build agent).

import { ToolRegistry } from "../agent/tools.js";
import type { Surface } from "../agent/system-prompt.js";
import { registerTextCommand } from "./01-text-command.js";
import { registerVoiceCapture } from "./02-voice-capture.js";
import { registerReminders } from "./03-reminders.js";
import { registerMorningBrief } from "./04-morning-brief.js";
import { registerWhatsOnMyPlate } from "./05-whats-on-my-plate.js";
import { registerMemoryRecall } from "./06-memory-recall.js";
import { registerScheduleCall } from "./07-schedule-call.js";
import { registerWebResearch } from "./08-web-research.js";
import { registerConfirmationRail } from "./09-confirmation-rail.js";
import { registerReceiptExpense } from "./10-receipt-expense.js";
import { registerFeatureRequest } from "./11-feature-request.js";
import { registerWhatsAppHistory } from "./12-whatsapp-history.js";
import { registerPersonalLists } from "./13-personal-lists.js";
import { registerEmailSearch } from "./14-email-search.js";
import { registerSpotify } from "./15-spotify.js";

export interface RegisterOpts {
  surface: Surface;
}

export function registerAllFeatures(opts: RegisterOpts = { surface: "whatsapp" }): ToolRegistry {
  const r = new ToolRegistry();
  registerTextCommand(r);
  registerVoiceCapture(r);
  registerReminders(r);
  registerMorningBrief(r);
  registerWhatsOnMyPlate(r);
  registerMemoryRecall(r);
  registerScheduleCall(r);
  // registerWebResearch disabled — replaced by Anthropic server-side web_search_20250305
  // tool injected directly in LLM client (see apps/bot/src/adapters.ts and
  // apps/dashboard/src/app/api/chat/route.ts). The stub here returned empty results.
  // registerWebResearch(r);
  registerConfirmationRail(r);
  registerReceiptExpense(r);
  registerFeatureRequest(r, { surface: opts.surface });
  registerWhatsAppHistory(r);
  registerPersonalLists(r);
  registerEmailSearch(r);
  registerSpotify(r);
  return r;
}

export * from "./01-text-command.js";
export * from "./02-voice-capture.js";
export * from "./03-reminders.js";
export * from "./04-morning-brief.js";
export * from "./05-whats-on-my-plate.js";
export * from "./06-memory-recall.js";
export * from "./07-schedule-call.js";
export * from "./08-web-research.js";
export * from "./09-confirmation-rail.js";
export * from "./10-receipt-expense.js";
export * from "./11-feature-request.js";
export * from "./12-whatsapp-history.js";
export * from "./13-personal-lists.js";
export * from "./14-email-search.js";
export * from "./15-spotify.js";
