// NitsyClaw bot worker entry point.
// Long-running Node process. Designed for Railway. NOT compatible with Vercel.

import { loadEnv } from "@nitsyclaw/shared";
import {
  getDb,
  insertFeatureRequest,
  listPendingFeatureRequests,
  logAudit,
  upsertSystemHeartbeat,
  type DB,
} from "@nitsyclaw/shared/db";
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
import { logBotError } from "./safe-log.js";
import { buildBotRuntimeMetadata } from "./bot-runtime.js";
import { QrRecoveryController, startQrRecoveryServer } from "./qr-recovery-server.js";
import { assertWhatsAppRuntimeAllowed } from "./whatsapp-runtime-guard.js";

loadBotDotenv();

async function main() {
  const env = loadEnv();
  const runtimeMetadata = buildBotRuntimeMetadata(process.env);
  assertWhatsAppRuntimeAllowed(process.env);
  console.log(
    `[boot] NitsyClaw bot starting (TZ=${env.TIMEZONE}, platform=${runtimeMetadata.platform}, runtime=${runtimeMetadata.runtimeId}, commit=${runtimeMetadata.commitShort})`,
  );
  const db = getDb(env.DATABASE_URL ?? env.DATABASE_URL_DIRECT);
  await upsertSystemHeartbeat(db, {
    source: "bot-runtime",
    status: "starting",
    metadata: runtimeMetadata,
  });

  const qrRecovery = new QrRecoveryController(process.env);
  const qrRecoveryServer = startQrRecoveryServer(qrRecovery, process.env);

  const rawWhatsapp = new WwebjsClient({
    sessionDir: whatsappSessionDir(env.WHATSAPP_SESSION_DIR),
    ownerNumber: env.WHATSAPP_OWNER_NUMBER,
    presenceUnavailableIntervalMs: env.NITSYCLAW_PRESENCE_UNAVAILABLE_INTERVAL_MS,
    initializeTimeoutMs: env.NITSYCLAW_WHATSAPP_INITIALIZE_TIMEOUT_MS,
    onQr: (payload) => qrRecovery.setQr(payload),
    onQrCleared: () => qrRecovery.clearQr(),
    onStatus: (event) => {
      void upsertSystemHeartbeat(db, {
        source: "whatsapp-client",
        status: statusForWhatsAppRuntimeEvent(event),
        metadata: publicWhatsAppRuntimeMetadata(event),
      }).catch((e) => logBotError("[boot] whatsapp status heartbeat failed", e));
    },
  });
  const whatsapp = new WhatsAppLoopBreaker(rawWhatsapp, {
    onTrip: (incident) => {
      console.error(`[boot] WhatsApp loop breaker tripped: ${incident.reason}`);
      void upsertSystemHeartbeat(db, {
        source: "whatsapp-loop-guard",
        status: "paused",
        metadata: { ...incident },
      }).catch((e) => logBotError("[boot] loop guard heartbeat failed", e));
      void logAudit(db, {
        actor: "system",
        tool: "whatsapp_loop_breaker",
        input: { ...incident },
        output: { action: incident.resetAt ? "cooldown_whatsapp_replies" : "paused_whatsapp_replies" },
        success: false,
        error: incident.reason,
      }).catch((e) => logBotError("[boot] loop guard audit failed", e));
      void queueLoopBreakerFeatureRequest(db, incident)
        .catch((e) => logBotError("[boot] loop guard feature request failed", e));
      pushNotify(
        incident.resetAt
          ? `WhatsApp replies cooling down until ${incident.resetAt}: ${incident.reason}`
          : `WhatsApp replies paused: ${incident.reason}`,
        {
          title: incident.resetAt ? "NitsyClaw cooled down WhatsApp replies" : "NitsyClaw paused a WhatsApp loop",
          priority: "urgent",
        },
      ).catch((e) => logBotError("[boot] loop guard notify failed", e));
    },
    onReset: (reason) => {
      console.log(`[boot] WhatsApp loop breaker reset after: ${reason}`);
      void upsertSystemHeartbeat(db, {
        source: "whatsapp-loop-guard",
        status: "ok",
        metadata: { resetAfter: reason },
      }).catch((e) => logBotError("[boot] loop guard reset heartbeat failed", e));
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
      DEFAULT_CURRENCY: env.DEFAULT_CURRENCY,
      REPLY_LANGUAGE: env.REPLY_LANGUAGE,
    },
    db,
    whatsapp: monitoredWhatsapp,
  });

  const router = new Router(deps, env.WHATSAPP_OWNER_NUMBER);
  monitoredWhatsapp.onMessage(async (m) => router.handle(m));

  await monitoredWhatsapp.ready();
  await upsertSystemHeartbeat(db, {
    source: "bot-runtime",
    status: "ok",
    metadata: runtimeMetadata,
  });
  const writeLoopGuardHeartbeat = () => {
    const loopBreaker = whatsapp.status();
    return upsertSystemHeartbeat(db, {
      source: "whatsapp-loop-guard",
      status: loopBreaker.paused ? "paused" : "ok",
      metadata: loopBreaker.paused
        ? { reason: loopBreaker.reason, resetAt: loopBreaker.resetAt }
        : { recentSendCount: loopBreaker.recentSendCount, recentOutboundCount: loopBreaker.recentOutboundCount },
    });
  };
  await writeLoopGuardHeartbeat().catch((e) => logBotError("[boot] loop guard startup heartbeat failed", e));
  const loopGuardHeartbeatInterval = setInterval(() => {
    writeLoopGuardHeartbeat().catch((e) => logBotError("[boot] loop guard periodic heartbeat failed", e));
  }, 60_000);
  loopGuardHeartbeatInterval.unref?.();
  console.log("[boot] WhatsApp ready");
  qrRecoveryServer?.setHealthProvider(() => {
    const loopBreaker = whatsapp.status();
    return {
      service: "nitsyclaw-bot",
      status: loopBreaker.paused ? "degraded" : "ok",
      whatsapp: {
        ready: true,
        loopBreaker,
      },
      runtime: runtimeMetadata,
      at: new Date().toISOString(),
    };
  });

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
      clearInterval(loopGuardHeartbeatInterval);
      await monitoredWhatsapp.destroy();
      qrRecoveryServer?.close();
      process.exit(0);
    } catch (e) {
      logBotError("[boot] shutdown failed", e);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((e) => {
  logBotError("[boot] fatal", e);
  process.exit(1);
});

async function queueLoopBreakerFeatureRequest(
  db: DB,
  incident: { reason: string; resetAt?: string },
): Promise<void> {
  const dedupeKey = incident.reason.startsWith("send burst")
    ? "whatsapp_loop_breaker:send_burst"
    : "whatsapp_loop_breaker:echo";
  const pending = await listPendingFeatureRequests(db);
  if (pending.some((row) => row.dedupeKey === dedupeKey)) return;

  await insertFeatureRequest(db, {
    description: `P0: WhatsApp loop breaker opened. Inspect audit_log tool=whatsapp_loop_breaker and harden regression tests. Reason: ${incident.reason}`,
    type: "bug",
    severity: "P0",
    size: "S",
    source: "dashboard",
    requestedBy: "system",
    implementationNotes: incident.resetAt
      ? `Auto-created by loop breaker cooldown path. Auto-reset scheduled for ${incident.resetAt}.`
      : "Auto-created by loop breaker manual-reset incident path.",
    dedupeKey,
  });
}
