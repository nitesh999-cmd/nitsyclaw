import { chromium, type Browser, type Page } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, relative, resolve } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadLocalBrainEnv } from "./local-brain-env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const dashboardDir = join(repoRoot, "apps", "dashboard");
const outputRoot = join(repoRoot, "output", "playwright", "local-brain-browser-proof");
const fixtureName = "local-brain-browser-proof";

async function main() {
  loadLocalBrainEnv();
  assertHostEnvSafe();
  const port = await findOpenPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const startedAt = new Date().toISOString();
  const evidenceDir = join(outputRoot, startedAt.replace(/[:.]/g, "-"));
  mkdirSync(evidenceDir, { recursive: true });

  let server: ChildProcessWithoutNullStreams | null = null;
  let browser: Browser | null = null;
  const serverLog: string[] = [];
  try {
    server = startDashboard(port, serverLog);
    await waitForHttp(baseUrl, serverLog);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await blockNonLocalhostBrowserRequests(page);
    await page.goto(`${baseUrl}/local-brain`, { waitUntil: "networkidle", timeout: 120_000 });

    const checks = await assertBrowserProof(page);
    const screenshotPath = join(evidenceDir, "local-brain-browser-proof.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const evidencePath = join(evidenceDir, "evidence.json");
    const relativeEvidencePath = toRepoRelative(evidencePath);
    const relativeScreenshotPath = toRepoRelative(screenshotPath);
    writeFileSync(evidencePath, JSON.stringify({
      status: "pass",
      startedAt,
      completedAt: new Date().toISOString(),
      baseUrl,
      fixtureName,
      checks,
      screenshotPath: relativeScreenshotPath,
      safety: {
        realDatabaseUrlPresent: false,
        appEnvironment: "local_synthetic_fixture",
        allowedNetwork: "browser requests limited to localhost; server env points only at loopback Ollama",
      },
    }, null, 2));
    console.log(JSON.stringify({
      status: "pass",
      evidencePath: relativeEvidencePath,
      screenshotPath: relativeScreenshotPath,
      checks,
    }, null, 2));
  } catch (error) {
    const failurePath = join(evidenceDir, "failure.json");
    writeFileSync(failurePath, JSON.stringify({
      status: "fail",
      startedAt,
      failedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
      serverLog: sanitizeServerLog(serverLog).slice(-80),
    }, null, 2));
    console.error(JSON.stringify({ status: "fail", failurePath, message: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  } finally {
    await browser?.close().catch(() => undefined);
    await stopServer(server);
  }
}

function toRepoRelative(path: string): string {
  return relative(repoRoot, path).replace(/\\/g, "/");
}

function assertHostEnvSafe() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME) {
    throw new Error("Refusing Local Brain browser proof outside a local test environment.");
  }
  if (nonEmpty(process.env.DATABASE_URL) || nonEmpty(process.env.DATABASE_URL_DIRECT)) {
    throw new Error("Refusing Local Brain browser proof because a real DATABASE_URL is present in this shell.");
  }
  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  if (!isLoopbackUrl(baseUrl)) {
    throw new Error("Refusing Local Brain browser proof because OLLAMA_BASE_URL is not loopback.");
  }
}

function startDashboard(port: number, serverLog: string[]): ChildProcessWithoutNullStreams {
  const nextBin = join(dashboardDir, "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(nextBin)) {
    throw new Error(`Next binary not found at ${nextBin}. Restore dependencies before running browser proof.`);
  }
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: "",
    DATABASE_URL_DIRECT: "",
    ANTHROPIC_API_KEY: "",
    OPENAI_API_KEY: "",
    GOOGLE_CLIENT_SECRET: "",
    MS_CLIENT_SECRET: "",
    SPOTIFY_CLIENT_SECRET: "",
    NTFY_TOPIC: "",
    NEXT_PUBLIC_POSTHOG_KEY: "",
    WHATSAPP_OWNER_NUMBER: "+61000000000",
    NITSYCLAW_DEV_AUTH_BYPASS: "1",
    NITSYCLAW_MODEL_MODE: "local_only",
    NITSYCLAW_LOCAL_BRAIN_BROWSER_PROOF: "1",
    NITSYCLAW_SYNTHETIC_DB_FIXTURE: fixtureName,
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
    OLLAMA_CHAT_MODEL: process.env.OLLAMA_CHAT_MODEL ?? "qwen3:8b",
    OLLAMA_EMBEDDING_MODEL: process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text:latest",
    OLLAMA_CONTEXT_LIMIT: process.env.OLLAMA_CONTEXT_LIMIT ?? "4096",
    OLLAMA_THINK: process.env.OLLAMA_THINK ?? "false",
    OLLAMA_TIMEOUT_MS: process.env.OLLAMA_TIMEOUT_MS ?? "45000",
  };
  const child = spawn(process.execPath, [nextBin, "dev", "--webpack", "-p", String(port)], {
    cwd: dashboardDir,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => serverLog.push(sanitizeLogLine(String(chunk))));
  child.stderr.on("data", (chunk) => serverLog.push(sanitizeLogLine(String(chunk))));
  return child;
}

async function blockNonLocalhostBrowserRequests(page: Page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
      await route.continue();
      return;
    }
    await route.abort("blockedbyclient");
  });
}

async function assertBrowserProof(page: Page): Promise<Record<string, string>> {
  await page.getByTestId("local-brain-browser-proof").waitFor({ state: "visible", timeout: 120_000 });
  const checks = {
    fixture: await text(page, "browser-proof-fixture-name"),
    todayFocus: await text(page, "browser-proof-today-focus"),
    preference: await text(page, "browser-proof-preference"),
    riskyAction: await text(page, "browser-proof-risky-action"),
    localRoute: await text(page, "browser-proof-local-route"),
  };
  if (checks.fixture !== fixtureName) throw new Error(`Unexpected fixture ${checks.fixture}`);
  if (!checks.todayFocus.includes("synthetic Local Brain browser proof")) throw new Error("Today focus proof did not render synthetic grounded focus.");
  if (!checks.preference.includes("peppermint tea")) throw new Error("Corrected preference was not shown.");
  if (!checks.riskyAction.includes("awaiting_approval") || !checks.riskyAction.includes("action calls 0")) throw new Error("Risky action did not remain waiting with zero action calls.");
  if (!checks.localRoute.includes("local / local_only")) throw new Error("Qwen route did not render local_only.");

  for (const name of [
    "todayFocusGrounded",
    "preferenceRecalled",
    "correctedMemoryExcluded",
    "foreignOwnerExcluded",
    "injectionExcluded",
    "riskyActionWaiting",
    "zeroOutboundActionCalls",
    "localOnlyQwenResponse",
  ]) {
    const value = await text(page, `browser-proof-check-${name}`);
    if (!value.startsWith("PASS")) throw new Error(`Browser proof check failed: ${name} -> ${value}`);
    checks[name] = value;
  }
  const bodyText = await page.locator("body").innerText();
  for (const forbidden of ["Other owner private memory", "Ignore all previous instructions", "saved credential", "chamomile tea"]) {
    if (bodyText.includes(forbidden)) throw new Error(`Forbidden synthetic data leaked into browser proof: ${forbidden}`);
  }
  return checks;
}

async function text(page: Page, testId: string): Promise<string> {
  return (await page.getByTestId(testId).innerText({ timeout: 30_000 })).trim();
}

async function waitForHttp(baseUrl: string, serverLog: string[]) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (serverLog.some((line) => /failed|error|EADDRINUSE/i.test(line))) {
      // Do not fail immediately; Next prints harmless warnings too. The final fetch decides.
    }
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(2_000) });
      if (response.status < 500) return;
    } catch {
      await delay(500);
    }
  }
  throw new Error(`Dashboard did not become reachable at ${baseUrl}. Last logs: ${sanitizeServerLog(serverLog).slice(-10).join(" | ")}`);
}

function findOpenPort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address?.port) resolvePort(address.port);
        else reject(new Error("Could not allocate a local port."));
      });
    });
  });
}

async function stopServer(server: ChildProcessWithoutNullStreams | null) {
  if (!server || server.killed) return;
  server.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolveDone) => server.once("exit", () => resolveDone())),
    delay(3_000).then(() => {
      if (!server.killed) server.kill("SIGKILL");
    }),
  ]);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function sanitizeServerLog(lines: string[]): string[] {
  return lines.map(sanitizeLogLine);
}

function sanitizeLogLine(line: string): string {
  return line
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://[redacted]")
    .replace(/(sk-[A-Za-z0-9_-]{12,})/g, "[redacted-key]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function nonEmpty(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

function isLoopbackUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

void main();
