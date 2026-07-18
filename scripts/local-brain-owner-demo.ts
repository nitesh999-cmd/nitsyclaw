import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, relative, resolve } from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadLocalBrainEnv } from "./local-brain-env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const dashboardDir = join(repoRoot, "apps", "dashboard");
const outputRoot = join(repoRoot, "output", "playwright", "local-brain-owner-demo");
const fixtureName = "local-brain-browser-proof";
const viewport = { width: 1920, height: 1080 };

interface DemoScene {
  id: string;
  target: string;
  kicker: string;
  title: string;
  detail: string;
}

const scenes: DemoScene[] = [
  {
    id: "01-private-by-design",
    target: "[role='status']",
    kicker: "1 / 6 - Private by design",
    title: "The AI and memory stay on this laptop.",
    detail: "qwen3:8b runs through Ollama in local-only mode, with no cloud fallback.",
  },
  {
    id: "02-remembers-what-matters",
    target: "[data-testid='owner-demo-memory']",
    kicker: "2 / 6 - Remembers what matters",
    title: "It recalls useful personal context.",
    detail: "The current peppermint-tea preference is retrieved for this synthetic owner.",
  },
  {
    id: "03-learns-corrections",
    target: "[data-testid='owner-demo-correction']",
    kicker: "3 / 6 - Learns corrections",
    title: "Correct it once, and the old memory stops being used.",
    detail: "The stale preference is excluded; only the correction remains active.",
  },
  {
    id: "04-protects-boundaries",
    target: "[data-testid='owner-demo-boundaries']",
    kicker: "4 / 6 - Protects boundaries",
    title: "Private memories stay with their owner.",
    detail: "Another owner's memory stays private, and hidden instructions are rejected.",
  },
  {
    id: "05-refuses-risky-action",
    target: "[data-testid='owner-demo-risky-action']",
    kicker: "5 / 6 - Refuses risky action",
    title: "Nothing risky is sent without approval.",
    detail: "The synthetic WhatsApp action remains waiting, with zero outbound calls.",
  },
  {
    id: "06-local-response",
    target: "[data-testid='owner-demo-local-response']",
    kicker: "6 / 6 - Real local response",
    title: "The answer comes from Qwen on this laptop.",
    detail: "Local Brain remembers privately, acts carefully, and runs locally.",
  },
];

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
  let context: BrowserContext | null = null;
  let rawVideoPath: string | null = null;
  const serverLog: string[] = [];
  const blockedExternalRequests: string[] = [];

  try {
    server = startDashboard(port, serverLog);
    await waitForHttp(baseUrl, serverLog);
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport,
      recordVideo: { dir: evidenceDir, size: viewport },
      colorScheme: "light",
    });
    const page = await context.newPage();
    const video = page.video();
    await blockNonLocalhostBrowserRequests(page, blockedExternalRequests);
    await page.goto(`${baseUrl}/local-brain`, { waitUntil: "networkidle", timeout: 120_000 });

    const checks = await assertOwnerDemo(page);
    await page.screenshot({ path: join(evidenceDir, "00-full-page-baseline.png"), fullPage: true });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
    await page.screenshot({ path: join(evidenceDir, "00-hero-clean.png") });
    await installCaptionOverlay(page);
    await pause(1_500);

    for (const scene of scenes) {
      await recordScene(page, scene, evidenceDir);
    }

    await page.getByTestId("owner-demo-ending").scrollIntoViewIfNeeded();
    await showCaption(page, {
      kicker: "Local Brain",
      title: "Remembers privately. Acts carefully. Runs locally.",
      detail: "Owner-only synthetic demonstration complete.",
    });
    await pause(8_000);

    await context.close();
    context = null;
    if (video) rawVideoPath = await video.path();

    const webmPath = join(evidenceDir, "local-brain-owner-demo.webm");
    if (!rawVideoPath || !existsSync(rawVideoPath)) throw new Error("Playwright did not produce the owner-demo video.");
    renameSync(rawVideoPath, webmPath);
    const mp4Path = convertToMp4IfAvailable(webmPath, evidenceDir);
    const artifactPaths = collectArtifactPaths(evidenceDir, webmPath, mp4Path);
    const privacyScan = assertArtifactTextSafe(pageTextForEvidence(checks, artifactPaths));
    const evidencePath = join(evidenceDir, "evidence.json");
    const evidence = {
      status: "pass",
      startedAt,
      completedAt: new Date().toISOString(),
      fixtureName,
      viewport,
      durationTargetSeconds: "60-90",
      checks,
      scenes: scenes.map(({ id, kicker, title, detail }) => ({ id, kicker, title, detail })),
      artifacts: artifactPaths,
      safety: {
        syntheticFixtureOnly: true,
        realDatabaseUrlPresent: false,
        qwenRoute: "local_only",
        outboundActionCalls: 0,
        blockedExternalBrowserRequests: blockedExternalRequests.length,
        allowedNetwork: "localhost dashboard and localhost Ollama only",
        privacyScan,
      },
    };
    writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({
      status: "pass",
      evidencePath: toRepoRelative(evidencePath),
      videoPath: toRepoRelative(mp4Path ?? webmPath),
      webmPath: toRepoRelative(webmPath),
      heroScreenshotPath: toRepoRelative(join(evidenceDir, "00-hero-clean.png")),
      sceneScreenshotPaths: scenes.map((scene) => toRepoRelative(join(evidenceDir, `${scene.id}.png`))),
      checks,
      safety: evidence.safety,
    }, null, 2));
  } catch (error) {
    const failurePath = join(evidenceDir, "failure.json");
    writeFileSync(failurePath, JSON.stringify({
      status: "fail",
      startedAt,
      failedAt: new Date().toISOString(),
      message: sanitizeLogLine(error instanceof Error ? error.message : String(error)),
      serverLog: sanitizeServerLog(serverLog).slice(-80),
    }, null, 2));
    console.error(JSON.stringify({ status: "fail", failurePath: toRepoRelative(failurePath), message: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await stopServer(server);
  }
}

async function recordScene(page: Page, scene: DemoScene, evidenceDir: string) {
  const target = page.locator(scene.target).first();
  await target.scrollIntoViewIfNeeded();
  await pause(1_200);
  await pointTo(page, target);
  await showCaption(page, scene);
  await pause(1_000);
  await page.screenshot({ path: join(evidenceDir, `${scene.id}.png`) });
  await pause(7_000);
}

async function pointTo(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (!box) return;
  await page.mouse.move(viewport.width - 90, viewport.height - 90);
  await page.mouse.move(box.x + Math.min(box.width * 0.82, box.width - 24), box.y + Math.min(box.height * 0.45, box.height - 24), { steps: 40 });
}

async function installCaptionOverlay(page: Page) {
  await page.evaluate(() => {
    if (document.getElementById("nitsyclaw-owner-demo-caption")) return;
    const overlay = document.createElement("aside");
    overlay.id = "nitsyclaw-owner-demo-caption";
    overlay.setAttribute("aria-live", "polite");
    Object.assign(overlay.style, {
      position: "fixed",
      left: "50%",
      bottom: "42px",
      width: "min(980px, calc(100vw - 96px))",
      transform: "translateX(-50%)",
      zIndex: "2147483647",
      padding: "20px 24px",
      border: "1px solid rgba(255,255,255,.18)",
      borderRadius: "16px",
      background: "rgba(17,24,39,.94)",
      boxShadow: "0 22px 60px rgba(0,0,0,.32)",
      color: "#fff",
      fontFamily: "Arial, sans-serif",
      opacity: "0",
      transition: "opacity 320ms ease, transform 320ms ease",
      pointerEvents: "none",
    });
    overlay.innerHTML = '<div data-caption-kicker style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#a7f3d0"></div><div data-caption-title style="margin-top:6px;font-size:28px;font-weight:700;line-height:1.2"></div><div data-caption-detail style="margin-top:7px;font-size:16px;line-height:1.45;color:#d1d5db"></div>';
    document.body.appendChild(overlay);
  });
}

async function showCaption(page: Page, caption: Pick<DemoScene, "kicker" | "title" | "detail">) {
  if (await page.locator("#nitsyclaw-owner-demo-caption").count() === 0) {
    await installCaptionOverlay(page);
  }
  await page.locator("#nitsyclaw-owner-demo-caption").evaluate((overlay, value) => {
    const kicker = overlay.querySelector("[data-caption-kicker]");
    const title = overlay.querySelector("[data-caption-title]");
    const detail = overlay.querySelector("[data-caption-detail]");
    if (kicker) kicker.textContent = value.kicker;
    if (title) title.textContent = value.title;
    if (detail) detail.textContent = value.detail;
    (overlay as HTMLElement).style.opacity = "1";
    (overlay as HTMLElement).style.transform = "translateX(-50%) translateY(0)";
  }, caption);
}

async function assertOwnerDemo(page: Page): Promise<Record<string, string>> {
  await page.getByTestId("local-brain-browser-proof").waitFor({ state: "visible", timeout: 120_000 });
  const checks = {
    fixture: await text(page, "browser-proof-fixture-name"),
    focus: await text(page, "browser-proof-today-focus"),
    preference: await text(page, "browser-proof-preference"),
    riskyAction: await text(page, "browser-proof-risky-action"),
    localRoute: await text(page, "browser-proof-local-route"),
    ending: await text(page, "owner-demo-ending"),
  };
  if (checks.fixture !== fixtureName) throw new Error(`Unexpected fixture ${checks.fixture}`);
  if (!checks.focus.includes("synthetic Local Brain browser proof")) throw new Error("Grounded Today focus was not rendered.");
  if (!checks.preference.includes("peppermint tea")) throw new Error("Current corrected preference was not rendered.");
  if (!checks.riskyAction.includes("Waiting for approval") || !checks.riskyAction.includes("0 actions sent")) throw new Error("Risky action was not held with zero action calls.");
  if (!checks.localRoute.includes("qwen3:8b via Ollama") || !checks.localRoute.includes("Local only")) throw new Error("Real Qwen response was not shown as local_only.");
  if (!checks.ending.includes("remembers privately, acts carefully, runs locally")) throw new Error("Owner-demo ending was not rendered.");

  for (const name of ["todayFocusGrounded", "preferenceRecalled", "correctedMemoryExcluded", "foreignOwnerExcluded", "injectionExcluded", "riskyActionWaiting", "zeroOutboundActionCalls", "localOnlyQwenResponse"]) {
    const value = await text(page, `browser-proof-check-${name}`);
    if (!value.startsWith("PASS")) throw new Error(`Owner-demo proof check failed: ${name}`);
    checks[name] = value;
  }

  const bodyText = await page.locator("body").innerText();
  assertArtifactTextSafe(bodyText);
  for (const forbidden of ["Other owner private memory", "Ignore all previous instructions", "saved credential", "chamomile tea"]) {
    if (bodyText.includes(forbidden)) throw new Error(`Excluded synthetic content leaked into owner demo: ${forbidden}`);
  }
  return checks;
}

function assertHostEnvSafe() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME) {
    throw new Error("Refusing owner demo outside a local test environment.");
  }
  if (nonEmpty(process.env.DATABASE_URL) || nonEmpty(process.env.DATABASE_URL_DIRECT)) {
    throw new Error("Refusing owner demo because a real DATABASE_URL is present in this shell.");
  }
  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  if (!isLoopbackUrl(baseUrl)) throw new Error("Refusing owner demo because OLLAMA_BASE_URL is not loopback.");
}

function startDashboard(port: number, serverLog: string[]): ChildProcessWithoutNullStreams {
  const nextBin = join(dashboardDir, "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(nextBin)) throw new Error(`Next binary not found at ${nextBin}. Restore dependencies before running the owner demo.`);
  const child = spawn(process.execPath, [nextBin, "dev", "--webpack", "--hostname", "127.0.0.1", "-p", String(port)], {
    cwd: dashboardDir,
    env: {
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
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => serverLog.push(sanitizeLogLine(String(chunk))));
  child.stderr.on("data", (chunk) => serverLog.push(sanitizeLogLine(String(chunk))));
  return child;
}

async function blockNonLocalhostBrowserRequests(page: Page, blocked: string[]) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
      await route.continue();
      return;
    }
    blocked.push(`${url.protocol}//${url.hostname}`);
    await route.abort("blockedbyclient");
  });
}

function convertToMp4IfAvailable(webmPath: string, evidenceDir: string): string | null {
  const probe = spawnSync("ffmpeg", ["-version"], { stdio: "ignore", windowsHide: true });
  if (probe.status !== 0) return null;
  const mp4Path = join(evidenceDir, "local-brain-owner-demo.mp4");
  const conversion = spawnSync("ffmpeg", ["-y", "-i", webmPath, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4Path], { stdio: "ignore", windowsHide: true });
  return conversion.status === 0 && existsSync(mp4Path) ? mp4Path : null;
}

function collectArtifactPaths(evidenceDir: string, webmPath: string, mp4Path: string | null) {
  return {
    baseline: toRepoRelative(join(evidenceDir, "00-full-page-baseline.png")),
    hero: toRepoRelative(join(evidenceDir, "00-hero-clean.png")),
    scenes: scenes.map((scene) => toRepoRelative(join(evidenceDir, `${scene.id}.png`))),
    webm: toRepoRelative(webmPath),
    mp4: mp4Path ? toRepoRelative(mp4Path) : null,
  };
}

function pageTextForEvidence(checks: Record<string, string>, artifacts: ReturnType<typeof collectArtifactPaths>) {
  return JSON.stringify({ checks, artifacts, scenes });
}

function assertArtifactTextSafe(value: string): "pass" {
  const forbidden = [
    /postgres(?:ql)?:\/\//i,
    /DATABASE_URL/i,
    /\bsk-[A-Za-z0-9_-]{12,}\b/,
    /\b(?:token|password|secret)\s*[:=]\s*\S+/i,
    /\b\+?61\d{8,}\b/,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(value)) throw new Error(`Privacy scan rejected owner-demo text matching ${pattern.source}.`);
  }
  return "pass";
}

function toRepoRelative(path: string): string {
  return relative(repoRoot, path).replace(/\\/g, "/");
}

async function text(page: Page, testId: string): Promise<string> {
  return (await page.getByTestId(testId).innerText({ timeout: 30_000 })).trim();
}

async function waitForHttp(baseUrl: string, serverLog: string[]) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(2_000) });
      if (response.status < 500) return;
    } catch {
      await pause(500);
    }
  }
  throw new Error(`Dashboard did not become reachable. Last logs: ${sanitizeServerLog(serverLog).slice(-10).join(" | ")}`);
}

function findOpenPort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => typeof address === "object" && address?.port ? resolvePort(address.port) : reject(new Error("Could not allocate a local port.")));
    });
  });
}

async function stopServer(server: ChildProcessWithoutNullStreams | null) {
  if (!server || server.killed) return;
  server.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolveDone) => server.once("exit", () => resolveDone())),
    pause(3_000).then(() => { if (!server.killed) server.kill("SIGKILL"); }),
  ]);
}

function pause(ms: number): Promise<void> {
  return new Promise((resolvePause) => setTimeout(resolvePause, ms));
}

function sanitizeServerLog(lines: string[]): string[] {
  return lines.map(sanitizeLogLine);
}

function sanitizeLogLine(line: string): string {
  return line.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://[redacted]").replace(/(sk-[A-Za-z0-9_-]{12,})/g, "[redacted-key]").replace(/\s+/g, " ").trim().slice(0, 500);
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
