// NitsyClaw bot worker entry point.
// Long-running Node process. Designed for Railway. NOT compatible with Vercel.

import { config as dotenvConfig } from "dotenv";
import { resolve } from "node:path";
dotenvConfig({ path: resolve(process.cwd(), "../../.env.local") });
import { loadEnv } from "@nitsyclaw/shared";
import { getDb, insertFeatureRequest, logAudit, upsertSystemHeartbeat } from "@nitsyclaw/shared/db";
import { pushNotify } from "@nitsyclaw/shared/notify";
import { WwebjsClient } from "./wwebjs-client.js";
import { WhatsAppLoopBreaker } from "./whatsapp-loop-breaker.js";
import { buildAgentDeps } from "./adapters.js";
import { Router } from "./router.js";
import { startScheduler } from "./scheduler.js";

async function main() {
  const env = loadEnv();
  console.log(`[boot] NitsyClaw bot starting (TZ=${env.TIMEZONE})`);
  const db = getDb(env.DATABASE_URL ?? env.DATABASE_URL_DIRECT);

  const rawWhatsapp = new WwebjsClient({
    sessionDir: env.WHATSAPP_SESSION_DIR,
    ownerNumber: env.WHATSAPP_OWNER_NUMBER,
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

  const deps = buildAgentDeps({
    env: {
      ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
      ANTHROPIC_MODEL: env.ANTHROPIC_MODEL,
      OPENAI_API_KEY: env.OPENAI_API_KEY,
      TRANSCRIPTION_MODEL: env.TRANSCRIPTION_MODEL,
      TIMEZONE: env.TIMEZONE,
    },
    db,
    whatsapp,
  });

  const router = new Router(deps, env.WHATSAPP_OWNER_NUMBER);
  whatsapp.onMessage(async (m) => router.handle(m));

  await whatsapp.ready();
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
      await whatsapp.destroy();
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
