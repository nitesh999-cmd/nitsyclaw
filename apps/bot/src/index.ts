// NitsyClaw bot worker entry point.
// Long-running Node process. Designed for Railway. NOT compatible with Vercel.

import { loadEnv } from "@nitsyclaw/shared";
import { getDb, insertFeatureRequest, logAudit, upsertSystemHeartbeat } from "@nitsyclaw/shared/db";
import { pushNotify } from "@nitsyclaw/shared/notify";
import { WwebjsClient } from "./wwebjs-client.js";
import {
  publicWhatsAppRuntimeMetadata,
  statusForWhatsAppRuntimeEvent,
} from "./whatsapp-health.js";
import { WhatsAppLoopBreaker } from "./whatsapp-loop-breaker.js";
import { WhatsAppSendMonitor } from "./whatsapp-send-monitor.js";
import { buildAgentDeps } from "./adapters.js";
import { Router } from "./router.js";
import { startScheduler } from "./scheduler.js";
import { loadBotDotenv, whatsappSessionDir } from "./secret-paths.js";

loadBotDotenv();

async function main() {
  const env = loadEnv();
  console.log(`[boot] NitsyClaw bot starting (TZ=${env.TIMEZONE})`);
  const db = getDb(env.DATABASE_URL ?? env.DATABASE_URL_DIRECT);

  const rawWhatsapp = new WwebjsClient({
    sessionDir: whatsappSessionDir(env.WHATSAPP_SESSION_DIR),
    ownerNumber: env.WHATSAPP_OWNER_NUMBER,
    presenceUnavailableIntervalMs: env.NITSYCLAW_PRESENCE_UNAVAILABLE_INTERVAL_MS,
    onStatus: (event) => {
      void upsertSystemHeartbeat(db, {
        source: "whatsapp-client",
        status: statusForWhatsAppRuntimeEvent(event),
        metadata: publicWhatsAppRuntimeMetadata(event),
      }).catch((e) => console.error("[boot] whatsapp status heartbeat failed", e));
    },
  });
  const whatsapp = new WhatsAppLoopBreaker(rawWhatsapp, {
    onTrip: (incident) => {
      console.error(`[boot] WhatsApp loop breaker tripped: ${incident.reason}`);
      void upsertSystemHeartbeat(db, {
        source: "whatsapp-loop-guard",
        status: "paused",
        metadata: { ...incident },
      }).catch((e) => console.error("[boot] loop guard heartbeat failed", e));
      void logAudit(db, {
        actor: "system",
        tool: "whatsapp_loop_breaker",
        input: { ...incident },
        output: { action: "paused_whatsapp_replies" },
        success: false,
        error: incident.reason,
      }).catch((e) => console.error("[boot] loop guard audit failed", e));
      void insertFeatureRequest(db, {
        description: `P0: WhatsApp loop breaker opened. Inspect audit_log tool=whatsapp_loop_breaker and harden regression tests. Reason: ${incident.reason}`,
        size: "S",
        source: "dashboard",
        requestedBy: "system",
        implementationNotes: "Auto-created by loop breaker incident path.",
      }).catch((e) => console.error("[boot] loop guard feature request failed", e));
      pushNotify(`WhatsApp replies paused: ${incident.reason}`, {
        title: "NitsyClaw paused a WhatsApp loop",
        priority: "urgent",
      }).catch((e) => console.error("[boot] loop guard notify failed", e));
    },
    onReset: (reason) => {
      console.error(`[boot] WhatsApp loop breaker reset after: ${reason}`);
      void upsertSystemHeartbeat(db, {
        source: "whatsapp-loop-guard",
        status: "ok",
        metadata: { resetAfter: reason },
      }).catch((e) => console.error("[boot] loop guard reset heartbeat failed", e));
    },
  });
  const monitoredWhatsapp = new WhatsAppSendMonitor(whatsapp, { db });

  const deps = buildAgentDeps({
    env: {
      ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
      ANTHROPIC_MODEL: env.ANTHROPIC_MODEL,
      OPENAI_API_KEY: env.OPENAI_API_KEY,
      TRANSCRIPTION_MODEL: env.TRANSCRIPTION_MODEL,
      SERPER_API_KEY: env.SERPER_API_KEY,
      ENABLE_WEB_RESEARCH: env.ENABLE_WEB_RESEARCH,
      TIMEZONE: env.TIMEZONE,
      HOME_CITY: env.HOME_CITY,
      HOME_REGION: env.HOME_REGION,
      HOME_COUNTRY: env.HOME_COUNTRY,
      CURRENT_CITY: env.CURRENT_CITY,
      CURRENT_REGION: env.CURRENT_REGION,
      CURRENT_COUNTRY: env.CURRENT_COUNTRY,
    },
    db,
    whatsapp: monitoredWhatsapp,
  });

  const router = new Router(deps, env.WHATSAPP_OWNER_NUMBER);
  monitoredWhatsapp.onMessage(async (m) => router.handle(m));

  await monitoredWhatsapp.ready();
  console.log("[boot] WhatsApp ready");

  if (env.ENABLE_HEARTBEAT) {
    startScheduler({
      deps,
      ownerPhone: env.WHATSAPP_OWNER_NUMBER,
      quietStart: env.QUIET_HOURS_START,
      quietEnd: env.QUIET_HOURS_END,
    });
    console.log("[boot] scheduler started");
  }

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[boot] shutting down (${signal})`);
    try {
      await monitoredWhatsapp.destroy();
      process.exit(0);
    } catch (e) {
      console.error("[boot] shutdown failed", e);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((e) => {
  console.error("[boot] fatal", e);
  process.exit(1);
});
