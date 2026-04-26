// NitsyClaw bot worker entry point.
// Long-running Node process. Designed for Railway. NOT compatible with Vercel.

import { config as dotenvConfig } from "dotenv";
import { resolve } from "node:path";
dotenvConfig({ path: resolve(process.cwd(), "../../.env.local") });
import { loadEnv } from "@nitsyclaw/shared";import { getDb } from "@nitsyclaw/shared/db";
import { WwebjsClient } from "./wwebjs-client.js";
import { buildAgentDeps } from "./adapters.js";
import { Router } from "./router.js";
import { startScheduler } from "./scheduler.js";

async function main() {
  const env = loadEnv();
  console.log(`[boot] NitsyClaw bot starting (TZ=${env.TIMEZONE})`);
 const db = getDb(env.DATABASE_URL ?? env.DATABASE_URL_DIRECT);

  const whatsapp = new WwebjsClient({
    sessionDir: env.WHATSAPP_SESSION_DIR,
    ownerNumber: env.WHATSAPP_OWNER_NUMBER,
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

  process.on("SIGINT", async () => {
    console.log("[boot] shutting down");
    await whatsapp.destroy();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error("[boot] fatal", e);
  process.exit(1);
});
