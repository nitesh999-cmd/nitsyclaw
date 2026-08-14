// Explicitly approved, one-shot owner self-chat ACK proof.
// This script is never called by normal startup or release gates.

import wweb from "whatsapp-web.js";
import { getDb } from "@nitsyclaw/shared/db";
import { loadEnv } from "@nitsyclaw/shared";
import { WhatsAppHeartbeatAckStateStore } from "./whatsapp-outbound-ack-store.js";
import {
  WhatsAppOutboundAckCoordinator,
  WhatsAppOutboundSubmissionError,
  type WhatsAppSubmissionClient,
} from "./whatsapp-outbound-submission.js";
import { loadBotDotenv, whatsappSessionDir } from "./secret-paths.js";
import { formatSafeLogError } from "./safe-log.js";

const APPROVAL_FLAG = "--approve-one-owner-send";
const MESSAGE_FLAG = "--message";
const MESSAGE_PATTERN = /^TEST: ACK telemetry owner-only [a-f0-9]{7,40}$/i;
const READY_TIMEOUT_MS = 60_000;
const SUBMISSION_TIMEOUT_MS = 45_000;
const ACK_TIMEOUT_MS = 45_000;

function argumentValue(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() ?? "" : "";
}

function parseApprovedMessage(): string {
  if (!process.argv.includes(APPROVAL_FLAG)) {
    throw new Error(`Refusing live WhatsApp send without ${APPROVAL_FLAG}.`);
  }
  const message = argumentValue(MESSAGE_FLAG);
  if (!MESSAGE_PATTERN.test(message)) {
    throw new Error(
      `Refusing live WhatsApp send: ${MESSAGE_FLAG} must be a unique owner-only ACK test label followed by a commit hash.`,
    );
  }
  return message;
}

function waitForReady(client: InstanceType<typeof wweb.Client>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("WhatsApp owner ACK test did not become ready before the timeout.")),
      READY_TIMEOUT_MS,
    );
    client.once("ready", () => {
      clearTimeout(timer);
      resolve();
    });
    client.once("qr", () => {
      clearTimeout(timer);
      reject(new Error("WhatsApp owner ACK test requires an already authenticated local session; QR login was refused."));
    });
    client.once("auth_failure", () => {
      clearTimeout(timer);
      reject(new Error("WhatsApp owner ACK test authentication failed."));
    });
  });
}

async function main(): Promise<void> {
  const message = parseApprovedMessage();
  loadBotDotenv();
  const env = loadEnv();
  const db = getDb(env.DATABASE_URL ?? env.DATABASE_URL_DIRECT);
  const target = env.WHATSAPP_OWNER_NUMBER.includes("@")
    ? env.WHATSAPP_OWNER_NUMBER
    : `${env.WHATSAPP_OWNER_NUMBER}@c.us`;
  const { Client, LocalAuth } = wweb;
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: whatsappSessionDir(env.WHATSAPP_SESSION_DIR) }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      handleSIGINT: false,
    },
  });
  const coordinator = new WhatsAppOutboundAckCoordinator({
    store: new WhatsAppHeartbeatAckStateStore(db),
  });
  coordinator.attach(client as unknown as WhatsAppSubmissionClient);

  try {
    const ready = waitForReady(client);
    await Promise.race([
      ready,
      client.initialize().then(() => ready),
    ]);
    const result = await coordinator.submit(
      client as unknown as WhatsAppSubmissionClient,
      {
        target,
        body: message,
        submissionTimeoutMs: SUBMISSION_TIMEOUT_MS,
        ackTimeoutMs: ACK_TIMEOUT_MS,
      },
    );
    console.log(`PASS owner-only ACK evidence: ack=${result.ack} delivery=${result.delivery}`);
  } catch (error) {
    if (error instanceof WhatsAppOutboundSubmissionError && error.code === "ack_timeout") {
      console.error("CONDITIONAL owner-only result: message ID created, but no server ACK arrived before the deadline.");
      process.exitCode = 2;
      return;
    }
    throw error;
  } finally {
    coordinator.detach();
    await client.destroy().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error(`FAIL owner-only ACK test: ${formatSafeLogError(error)}`);
  process.exitCode = 1;
});
