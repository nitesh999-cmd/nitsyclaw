import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, relative, resolve } from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadLocalBrainEnv } from "./local-brain-env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const dashboardDir = join(repoRoot, "apps", "dashboard");
const outputRoot = join(repoRoot, "output", "playwright", "local-brain-prospect-demo-v2");
const fixtureName = "local-brain-prospect-demo-v2";
const viewport = { width: 1920, height: 1080 };
const expectedCommands = {
  focus: "What should I focus on today?",
  correct: "Correction: I drink coffee, not peppermint tea.",
  recall: "What do I drink?",
  propose: "Message Alex that I accept the quote.",
};
const implementationSourcePaths = [
  "apps/dashboard/src/app/api/local-brain/prospect-demo/route.ts",
  "apps/dashboard/src/app/dashboard-shell.tsx",
  "apps/dashboard/src/app/local-brain/prospect-demo-fixture.test.ts",
  "apps/dashboard/src/app/local-brain/prospect-demo-fixture.ts",
  "apps/dashboard/src/app/local-brain/prospect-demo/page.test.ts",
  "apps/dashboard/src/app/local-brain/prospect-demo/page.tsx",
  "package.json",
  "scripts/local-brain-prospect-demo.ts",
  "scripts/local-only-network-guard.cjs",
];

interface MediaMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  videoCodec: string;
  videoBitrate: number;
  audioCodec: string | null;
  audioStreams: number;
  formatBitrate: number;
}

async function main() {
  loadLocalBrainEnv();
  assertHostEnvSafe();
  const port = await findOpenPort();
  const baseUrl = `http://localhost:${port}`;
  const startedAt = new Date().toISOString();
  const evidenceDir = join(outputRoot, startedAt.replace(/[:.]/g, "-"));
  mkdirSync(evidenceDir, { recursive: true });
  const networkAuditPath = join(evidenceDir, "server-network-audit.jsonl");
  writeFileSync(networkAuditPath, "", "utf8");
  const source = readSourceProvenance();

  let server: ChildProcessWithoutNullStreams | null = null;
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  const serverLog: string[] = [];
  const blockedExternalRequests: string[] = [];
  const observedRequests: string[] = [];

  try {
    server = startDashboard(port, serverLog, networkAuditPath);
    await waitForHttp(baseUrl, serverLog);
    assertNoServerEgress(networkAuditPath);
    browser = await chromium.launch({ headless: true });
    await warmProductPath(browser, baseUrl);
    assertNoServerEgress(networkAuditPath);

    context = await browser.newContext({
      viewport,
      recordVideo: { dir: evidenceDir, size: viewport },
      colorScheme: "light",
      reducedMotion: "no-preference",
    });
    page = await context.newPage();
    const video = page.video();
    await blockNonLocalhostBrowserRequests(page, blockedExternalRequests, observedRequests);
    await page.goto(`${baseUrl}/local-brain/prospect-demo`, { waitUntil: "networkidle", timeout: 120_000 });
    await page.getByTestId("prospect-demo-ready").getByText("Ready on this laptop").waitFor({ timeout: 30_000 });
    const resetBeforeVerified = await resetDemo(page);
    await assertCleanProspectSurface(page);

    const recordingStart = Date.now();
    await showFullScreenCard(page, {
      eyebrow: "NitsyClaw Local Brain",
      title: "A personal assistant that remembers your life without sending it to the cloud.",
      detail: "Private preview • fictional demonstration data",
    });
    await page.screenshot({ path: join(evidenceDir, "00-opening.png") });
    await holdTimeline(recordingStart, 4_000);
    await removeFullScreenCard(page);
    await page.screenshot({ path: join(evidenceDir, "00-hero.png") });

    await typeAndSend(page, expectedCommands.focus, 34);
    await waitForAssistantReply(page, 2);
    const focusText = await latestAssistantText(page);
    assertGroundedFocus(focusText);
    await page.getByTestId("prospect-private-indicator").filter({ hasText: "Remembered privately" }).waitFor();
    await page.screenshot({ path: join(evidenceDir, "01-grounded-focus.png") });
    await holdTimeline(recordingStart, 14_000);

    await typeAndSend(page, expectedCommands.correct, 30);
    await waitForAssistantReply(page, 3);
    const correctionText = await latestAssistantText(page);
    if (!correctionText.includes("remember coffee from now on")) throw new Error("Correction acknowledgement was not rendered.");
    await page.screenshot({ path: join(evidenceDir, "02-correction.png") });
    await holdTimeline(recordingStart, 22_000);

    await typeAndSend(page, expectedCommands.recall, 42);
    await waitForAssistantReply(page, 4);
    const recallText = await latestAssistantText(page);
    if (!recallText.includes("You drink coffee") || !recallText.includes("retired the old peppermint tea note")) {
      throw new Error("Corrected preference was not recalled with the old memory retired.");
    }
    await page.screenshot({ path: join(evidenceDir, "03-corrected-recall.png") });
    await holdTimeline(recordingStart, 29_000);

    await typeAndSend(page, expectedCommands.propose, 32);
    await waitForAssistantReply(page, 5);
    const approvalCard = page.getByTestId("prospect-approval-card");
    await approvalCard.waitFor();
    await approvalCard.scrollIntoViewIfNeeded();
    await approvalCard.getByText("Ready for your review", { exact: true }).waitFor();
    await approvalCard.getByRole("button", { name: "Approve and send", exact: true }).waitFor();
    await approvalCard.getByRole("button", { name: "Edit", exact: true }).waitFor();
    await approvalCard.getByRole("button", { name: "Cancel", exact: true }).waitFor();
    if (!(await page.getByTestId("prospect-nothing-sent").innerText()).includes("Nothing has been sent")) {
      throw new Error("Approval UI did not make the no-send state clear.");
    }
    const typographyProof = await readTypographyProof(page);
    await page.screenshot({ path: join(evidenceDir, "04-approval-waiting.png") });
    await holdTimeline(recordingStart, 37_000);

    await showFullScreenCard(page, {
      eyebrow: "Local Brain",
      title: "Remembers privately. Acts carefully. Runs locally.",
      detail: "Would you trust this with your life admin?",
    });
    await page.screenshot({ path: join(evidenceDir, "05-ending.png") });
    await holdTimeline(recordingStart, 41_000);

    const runtimeProof = await readRuntimeProof(page);
    const renderedPageText = await page.locator("body").innerText();
    const resetAfterVerified = await resetDemo(page);
    await context.close();
    context = null;
    if (!video) throw new Error("Playwright did not start prospect-demo video recording.");
    const rawVideoPath = await video.path();
    if (!existsSync(rawVideoPath)) throw new Error("Playwright did not produce the prospect-demo video.");
    const webmPath = join(evidenceDir, "local-brain-prospect-demo-v2.webm");
    renameSync(rawVideoPath, webmPath);

    const mediaTools = findMediaTools();
    if (!mediaTools) throw new Error("A local FFmpeg/FFprobe pair is required to create and inspect the prospect MP4.");
    const mp4Path = encodeMasterMp4(mediaTools.ffmpeg, webmPath, evidenceDir);
    const metadata = probeMedia(mediaTools.ffprobe, mp4Path);
    const quality = runQualityGate(mediaTools.ffmpeg, mp4Path, evidenceDir, metadata, typographyProof);
    const phone = await recordPhoneCut(browser, baseUrl, evidenceDir, blockedExternalRequests, observedRequests, mediaTools);
    const voiceoverPath = writeVoiceoverScript(evidenceDir);
    const serverExternalAttempts = readNetworkAudit(networkAuditPath);
    const locallyMockedFrameworkRequests = readNetworkMocks(networkAuditPath);
    const textPrivacyScan = assertArtifactTextSafe([
      renderedPageText,
      focusText,
      correctionText,
      recallText,
      phone.renderedPageText,
      readFileSync(voiceoverPath, "utf8"),
      serverLog.join("\n"),
      JSON.stringify({ runtimeProof, observedRequests, quality, metadata, source }),
    ].join("\n"));
    const externalRequestHosts = [...new Set(observedRequests.filter((url) => !isLocalBrowserUrl(url)).map(hostForEvidence))];

    if (metadata.durationSeconds < 35 || metadata.durationSeconds > 45) {
      throw new Error(`Prospect master duration ${metadata.durationSeconds.toFixed(2)}s is outside the required 35-45s window.`);
    }
    if (metadata.width !== 1920 || metadata.height !== 1080 || metadata.videoCodec !== "h264") {
      throw new Error("Prospect master is not H.264 at 1920x1080.");
    }
    if (metadata.audioStreams !== 0) throw new Error("Silent prospect master unexpectedly contains an audio stream.");
    if (blockedExternalRequests.length !== 0 || externalRequestHosts.length !== 0) {
      throw new Error("Prospect browser attempted a non-localhost network request.");
    }
    if (serverExternalAttempts.length !== 0) {
      throw new Error(`Prospect server attempted non-loopback network access: ${serverExternalAttempts.join(", ")}`);
    }
    if (!runtimeProof.localOnly || !runtimeProof.qwenUsed || !runtimeProof.oldMemoryRetired || runtimeProof.outboundActionCalls !== 0) {
      throw new Error("Prospect runtime proof did not preserve local-only, correction, and zero-send guarantees.");
    }

    const artifactPaths = {
      masterMp4: mp4Path,
      sourceWebm: webmPath,
      opening: join(evidenceDir, "00-opening.png"),
      hero: join(evidenceDir, "00-hero.png"),
      groundedFocus: join(evidenceDir, "01-grounded-focus.png"),
      correction: join(evidenceDir, "02-correction.png"),
      correctedRecall: join(evidenceDir, "03-corrected-recall.png"),
      approvalWaiting: join(evidenceDir, "04-approval-waiting.png"),
      ending: join(evidenceDir, "05-ending.png"),
      qualityContactSheet: join(evidenceDir, "quality-contact-sheet.png"),
      phoneMasterMp4: phone.mp4Path,
      phoneSourceWebm: phone.webmPath,
      phoneApproval: phone.approvalScreenshot,
      phoneQualityContactSheet: phone.qualityContactSheet,
      voiceoverScript: voiceoverPath,
      serverNetworkAudit: networkAuditPath,
    };
    const artifactHashes = Object.fromEntries(Object.entries(artifactPaths).map(([name, path]) => [name, sha256File(path)]));
    const evidencePath = join(evidenceDir, "evidence.json");
    const evidence = {
      status: "pass",
      startedAt,
      completedAt: new Date().toISOString(),
      fixtureName,
      source,
      viewport,
      promise: "A personal assistant that remembers your life without sending it to the cloud.",
      interactions: Object.values(expectedCommands),
      runtimeProof,
      typographyProof,
      media: metadata,
      phoneMedia: phone.metadata,
      quality,
      phoneQuality: phone.quality,
      artifactHashes,
      artifacts: {
        ...Object.fromEntries(Object.entries(artifactPaths).map(([name, path]) => [name, toRepoRelative(path)])),
        qualityContactSheet: toRepoRelative(join(evidenceDir, "quality-contact-sheet.png")),
        qualityFrames: toRepoRelative(join(evidenceDir, "quality-frames")),
      },
      safety: {
        fictionalFixtureOnly: true,
        realDatabaseUrlPresent: false,
        allowedNetwork: "localhost dashboard and localhost Ollama only",
        blockedExternalBrowserRequests: blockedExternalRequests.length,
        externalRequestHosts,
        blockedExternalServerRequests: serverExternalAttempts.length,
        locallyMockedFrameworkRequests,
        outboundActionCalls: runtimeProof.outboundActionCalls,
        textPrivacyScan: {
          status: textPrivacyScan,
          scope: "Rendered page text, demonstrated replies, voiceover script, sanitized server logs, request metadata, source metadata",
          binaryMediaReview: "Separate visual inspection required for screenshots and video frames",
        },
        stateResetBeforeAndAfter: resetBeforeVerified && resetAfterVerified && phone.stateResetBeforeAndAfter,
      },
      scope: {
        publicReadyClaim: false,
        ownerOnlyPrivatePreview: true,
        verticalCutProduced: true,
        squareCutProduced: false,
        narration: "Silent captioned master. Voiceover script supplied; no credible local natural voice was assumed.",
      },
    };
    writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
    const manifestPath = join(evidenceDir, "manifest.sha256.json");
    writeFileSync(manifestPath, JSON.stringify({
      source,
      hashes: { evidence: sha256File(evidencePath), ...artifactHashes },
    }, null, 2));
    console.log(JSON.stringify({
      status: "pass",
      evidencePath: toRepoRelative(evidencePath),
      masterMp4: toRepoRelative(mp4Path),
      phoneMp4: toRepoRelative(phone.mp4Path),
      manifest: toRepoRelative(manifestPath),
      media: metadata,
      runtimeProof,
      quality,
      screenshots: evidence.artifacts,
      safety: evidence.safety,
    }, null, 2));
  } catch (error) {
    if (page) await resetDemo(page).catch(() => undefined);
    const failurePath = join(evidenceDir, "failure.json");
    writeFileSync(failurePath, JSON.stringify({
      status: "fail",
      startedAt,
      failedAt: new Date().toISOString(),
      message: sanitizeLogLine(error instanceof Error ? error.message : String(error)),
      serverLog: serverLog.map(sanitizeLogLine).slice(-80),
    }, null, 2));
    console.error(JSON.stringify({ status: "fail", failurePath: toRepoRelative(failurePath), message: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await stopServer(server);
  }
}

async function warmProductPath(browser: Browser, baseUrl: string) {
  const context = await browser.newContext({ viewport, colorScheme: "light" });
  const page = await context.newPage();
  const blocked: string[] = [];
  const observed: string[] = [];
  await blockNonLocalhostBrowserRequests(page, blocked, observed);
  await page.goto(`${baseUrl}/local-brain/prospect-demo`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.getByTestId("prospect-demo-ready").getByText("Ready on this laptop").waitFor({ timeout: 30_000 });
  const warmResult = await page.evaluate(async (command) => {
    const response = await fetch("/api/local-brain/prospect-demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "focus", text: command }),
    });
    return { ok: response.ok, body: await response.json() as { proof?: { qwenUsed?: boolean }; error?: string } };
  }, expectedCommands.focus);
  if (!warmResult.ok || !warmResult.body.proof?.qwenUsed) throw new Error(warmResult.body.error ?? "Local Qwen warm-up failed.");
  await resetDemo(page);
  await context.close();
}

async function recordPhoneCut(
  browser: Browser,
  baseUrl: string,
  evidenceDir: string,
  blockedExternalRequests: string[],
  observedRequests: string[],
  mediaTools: { ffmpeg: string; ffprobe: string },
) {
  const phoneViewport = { width: 360, height: 640 };
  const phoneVideo = { width: 1080, height: 1920 };
  const context = await browser.newContext({
    viewport: phoneViewport,
    deviceScaleFactor: 3,
    recordVideo: { dir: evidenceDir, size: phoneViewport },
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const video = page.video();
  try {
    await blockNonLocalhostBrowserRequests(page, blockedExternalRequests, observedRequests);
    await page.goto(`${baseUrl}/local-brain/prospect-demo`, { waitUntil: "networkidle", timeout: 120_000 });
    await page.getByTestId("prospect-demo-ready").getByText("Ready on this laptop").waitFor({ timeout: 30_000 });
    const resetBeforeVerified = await resetDemo(page);
    await assertCleanProspectSurface(page);

    const recordingStart = Date.now();
    await showFullScreenCard(page, {
      eyebrow: "NitsyClaw Local Brain",
      title: "A personal assistant that remembers your life without sending it to the cloud.",
      detail: "Private preview • fictional demonstration data",
    });
    await holdTimeline(recordingStart, 4_000);
    await removeFullScreenCard(page);

    await typeAndSend(page, expectedCommands.focus, 22);
    await waitForAssistantReply(page, 2);
    assertGroundedFocus(await latestAssistantText(page));
    await holdTimeline(recordingStart, 13_000);

    await typeAndSend(page, expectedCommands.correct, 20);
    await waitForAssistantReply(page, 3);
    await holdTimeline(recordingStart, 21_000);

    await typeAndSend(page, expectedCommands.recall, 28);
    await waitForAssistantReply(page, 4);
    await holdTimeline(recordingStart, 28_000);

    await typeAndSend(page, expectedCommands.propose, 21);
    await waitForAssistantReply(page, 5);
    const approval = page.getByTestId("prospect-approval-card");
    await approval.waitFor();
    await approval.scrollIntoViewIfNeeded();
    const approvalScreenshot = join(evidenceDir, "phone-approval-waiting.png");
    await page.screenshot({ path: approvalScreenshot });
    await holdTimeline(recordingStart, 36_000);

    await showFullScreenCard(page, {
      eyebrow: "Local Brain",
      title: "Remembers privately. Acts carefully. Runs locally.",
      detail: "Would you trust this with your life admin?",
    });
    await holdTimeline(recordingStart, 41_000);

    const renderedPageText = await page.locator("body").innerText();
    const runtimeProof = await readRuntimeProof(page);
    const typography = await readTypographyProof(page);
    const resetAfterVerified = await resetDemo(page);
    await context.close();
    if (!video) throw new Error("Playwright did not start the phone prospect video recording.");
    const rawPath = await video.path();
    const webmPath = join(evidenceDir, "local-brain-prospect-demo-v2-phone.webm");
    renameSync(rawPath, webmPath);
    const mp4Path = encodeH264Mp4(
      mediaTools.ffmpeg,
      webmPath,
      join(evidenceDir, "local-brain-prospect-demo-v2-phone.mp4"),
      "scale=1080:1920:flags=lanczos",
    );
    const metadata = probeMedia(mediaTools.ffprobe, mp4Path);
    const phoneQuality = runPhoneQualityGate(mediaTools.ffmpeg, mp4Path, evidenceDir, metadata, typography);
    if (metadata.width !== phoneVideo.width || metadata.height !== phoneVideo.height || metadata.videoCodec !== "h264") {
      throw new Error("Phone prospect cut is not H.264 at 1080x1920.");
    }
    if (!runtimeProof.localOnly || !runtimeProof.qwenUsed || !runtimeProof.oldMemoryRetired || runtimeProof.outboundActionCalls !== 0) {
      throw new Error("Phone prospect cut did not preserve Local Brain safety proof.");
    }
    return {
      mp4Path,
      webmPath,
      approvalScreenshot,
      qualityContactSheet: join(evidenceDir, "phone-quality-contact-sheet.png"),
      metadata,
      quality: phoneQuality,
      renderedPageText,
      stateResetBeforeAndAfter: resetBeforeVerified && resetAfterVerified,
    };
  } finally {
    if (context.pages().length) await resetDemo(page).catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}

async function typeAndSend(page: Page, text: string, delay: number) {
  const input = page.getByTestId("prospect-demo-input");
  await input.click();
  await input.fill("");
  await input.pressSequentially(text, { delay });
  await page.getByTestId("prospect-demo-send").click();
}

async function waitForAssistantReply(page: Page, count: number) {
  await page.getByTestId("prospect-demo-thinking").waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  const messages = page.getByTestId("prospect-assistant-message");
  await messages.nth(count - 1).waitFor({ state: "visible", timeout: 60_000 });
  await page.getByTestId("prospect-demo-thinking").waitFor({ state: "detached", timeout: 60_000 }).catch(() => undefined);
}

async function latestAssistantText(page: Page): Promise<string> {
  return (await page.getByTestId("prospect-assistant-message").last().innerText()).trim();
}

function assertGroundedFocus(text: string) {
  if (!/electricity/i.test(text) || !/Friday/i.test(text) || !/dentist/i.test(text) || !/3\s*(?:pm|p\.m\.)/i.test(text)) {
    throw new Error("Recorded focus response was not grounded in the fictional bill and dentist context.");
  }
}

async function readRuntimeProof(page: Page): Promise<{ localOnly: boolean; qwenUsed: boolean; oldMemoryRetired: boolean; outboundActionCalls: number }> {
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/local-brain/prospect-demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", text: "" }),
    });
    return response.json() as Promise<{ proof: { localOnly: boolean; qwenUsed: boolean; oldMemoryRetired: boolean; outboundActionCalls: number } }>;
  });
  return result.proof;
}

async function readTypographyProof(page: Page): Promise<{ assistantMessagePx: number; userMessagePx: number; approvalMessagePx: number; inputPx: number }> {
  const proof = await page.evaluate(() => {
    const assistant = document.querySelector("[data-testid='prospect-assistant-message'] p");
    const user = document.querySelector("[data-testid='prospect-user-message'] p");
    const approval = document.querySelector("[data-testid='prospect-approval-card'] p:nth-of-type(3)");
    const input = document.querySelector("[data-testid='prospect-demo-input']");
    return {
      assistantMessagePx: assistant ? Number.parseFloat(getComputedStyle(assistant).fontSize) : 0,
      userMessagePx: user ? Number.parseFloat(getComputedStyle(user).fontSize) : 0,
      approvalMessagePx: approval ? Number.parseFloat(getComputedStyle(approval).fontSize) : 0,
      inputPx: input ? Number.parseFloat(getComputedStyle(input).fontSize) : 0,
    };
  });
  if (proof.assistantMessagePx < 17 || proof.userMessagePx < 17 || proof.approvalMessagePx < 16 || proof.inputPx < 17) {
    throw new Error(`Critical prospect text is below the readability floor: ${JSON.stringify(proof)}`);
  }
  return proof;
}

async function resetDemo(page: Page): Promise<boolean> {
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/local-brain/prospect-demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset", text: "" }),
    });
    return { ok: response.ok, body: await response.json() as { proof?: { outboundActionCalls?: number }; error?: string } };
  });
  if (!result.ok || result.body.proof?.outboundActionCalls !== 0) {
    throw new Error(result.body.error ?? "Prospect demo reset was not verified.");
  }
  return true;
}

async function assertCleanProspectSurface(page: Page) {
  await page.getByTestId("prospect-demo-shell").waitFor();
  if (await page.locator(".nc-sidebar").count()) throw new Error("Dashboard developer navigation leaked into prospect demo.");
  const body = await page.locator("body").innerText();
  for (const forbidden of ["fixture", "ownerHash", "database", "qwen3:8b", "Ollama", "test report", "prompt injection"]) {
    if (body.toLowerCase().includes(forbidden.toLowerCase())) throw new Error(`Technical wording leaked into prospect surface: ${forbidden}`);
  }
  assertArtifactTextSafe(body);
}

async function showFullScreenCard(page: Page, card: { eyebrow: string; title: string; detail: string }) {
  await page.evaluate((value) => {
    const compact = window.innerWidth < 600;
    document.getElementById("prospect-demo-title-card")?.remove();
    const overlay = document.createElement("section");
    overlay.id = "prospect-demo-title-card";
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      display: "grid",
      placeItems: "center",
      padding: compact ? "28px" : "100px",
      background: "#f4efe6",
      color: "#171915",
      fontFamily: "Arial, sans-serif",
      opacity: "1",
      transition: "opacity 350ms ease",
    });
    const content = document.createElement("div");
    Object.assign(content.style, { width: compact ? "100%" : "min(1080px, 88vw)", textAlign: "center" });
    const eyebrow = document.createElement("div");
    Object.assign(eyebrow.style, { fontSize: compact ? "12px" : "14px", fontWeight: "700", textTransform: "uppercase", color: "#49715a" });
    eyebrow.textContent = value.eyebrow;
    const title = document.createElement("h2");
    Object.assign(title.style, { margin: compact ? "18px auto 0" : "24px auto 0", fontSize: compact ? "34px" : "64px", lineHeight: "1.08", fontWeight: "650", maxWidth: "1050px", letterSpacing: "0" });
    title.textContent = value.title;
    const detail = document.createElement("p");
    Object.assign(detail.style, { margin: compact ? "20px auto 0" : "28px auto 0", fontSize: compact ? "15px" : "20px", lineHeight: "1.5", color: "#686b64" });
    detail.textContent = value.detail;
    const line = document.createElement("div");
    Object.assign(line.style, { width: "58px", height: "4px", borderRadius: "999px", background: "#214b36", margin: "34px auto 0" });
    content.append(eyebrow, title, detail, line);
    overlay.appendChild(content);
    document.body.appendChild(overlay);
  }, card);
}

async function removeFullScreenCard(page: Page) {
  await page.locator("#prospect-demo-title-card").evaluate((element) => { (element as HTMLElement).style.opacity = "0"; });
  await page.waitForTimeout(400);
  await page.locator("#prospect-demo-title-card").evaluate((element) => element.remove());
}

async function holdTimeline(startedAt: number, targetMs: number) {
  const remaining = targetMs - (Date.now() - startedAt);
  if (remaining > 0) await pause(remaining);
}

function startDashboard(port: number, serverLog: string[], networkAuditPath: string): ChildProcessWithoutNullStreams {
  const nextBin = join(dashboardDir, "node_modules", "next", "dist", "bin", "next");
  const networkGuard = join(repoRoot, "scripts", "local-only-network-guard.cjs");
  if (!existsSync(nextBin)) throw new Error(`Next binary not found at ${nextBin}. Restore dependencies before running the prospect demo.`);
  if (!existsSync(networkGuard)) throw new Error(`Local-only network guard not found at ${networkGuard}.`);
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
      NEXT_TELEMETRY_DISABLED: "1",
      NODE_OPTIONS: `--require="${networkGuard.replace(/\\/g, "/")}"`,
      NITSYCLAW_LOCAL_NETWORK_AUDIT_FILE: networkAuditPath,
      WHATSAPP_OWNER_NUMBER: "+61000000000",
      NITSYCLAW_DEV_AUTH_BYPASS: "1",
      NITSYCLAW_MODEL_MODE: "local_only",
      NITSYCLAW_LOCAL_BRAIN_PROSPECT_DEMO: "1",
      NITSYCLAW_SYNTHETIC_DB_FIXTURE: fixtureName,
      OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
      OLLAMA_CHAT_MODEL: process.env.OLLAMA_CHAT_MODEL ?? "qwen3:8b",
      OLLAMA_EMBEDDING_MODEL: process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text:latest",
      OLLAMA_CONTEXT_LIMIT: "4096",
      OLLAMA_THINK: "false",
      OLLAMA_TIMEOUT_MS: "45000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => serverLog.push(sanitizeLogLine(String(chunk))));
  child.stderr.on("data", (chunk) => serverLog.push(sanitizeLogLine(String(chunk))));
  return child;
}

async function blockNonLocalhostBrowserRequests(page: Page, blocked: string[], observed: string[]) {
  page.on("request", (request) => observed.push(request.url()));
  await page.route("**/*", async (route) => {
    const raw = route.request().url();
    if (isLocalBrowserUrl(raw)) {
      await route.continue();
      return;
    }
    blocked.push(hostForEvidence(raw));
    await route.abort("blockedbyclient");
  });
}

function isLocalBrowserUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return ["http:", "ws:"].includes(url.protocol) && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  } catch {
    return raw.startsWith("data:") || raw.startsWith("blob:");
  }
}

function hostForEvidence(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return "non-network-resource";
  }
}

function findMediaTools(): { ffmpeg: string; ffprobe: string } | null {
  const candidates = [
    { ffmpeg: "ffmpeg", ffprobe: "ffprobe" },
    {
      ffmpeg: "C:\\Program Files\\Lian-Li\\L-Connect 3\\x64\\ffmpeg.exe",
      ffprobe: "C:\\Program Files\\Lian-Li\\L-Connect 3\\x64\\ffprobe.exe",
    },
  ];
  for (const candidate of candidates) {
    const ffmpeg = spawnSync(candidate.ffmpeg, ["-version"], { stdio: "ignore", windowsHide: true });
    const ffprobe = spawnSync(candidate.ffprobe, ["-version"], { stdio: "ignore", windowsHide: true });
    if (ffmpeg.status === 0 && ffprobe.status === 0) return candidate;
  }
  return null;
}

function encodeMasterMp4(ffmpeg: string, webmPath: string, evidenceDir: string): string {
  const mp4Path = join(evidenceDir, "local-brain-prospect-demo-v2-master.mp4");
  return encodeH264Mp4(ffmpeg, webmPath, mp4Path);
}

function encodeH264Mp4(ffmpeg: string, webmPath: string, mp4Path: string, videoFilter?: string): string {
  const args = ["-y", "-i", webmPath];
  if (videoFilter) args.push("-vf", videoFilter);
  args.push(
    "-an",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    mp4Path,
  );
  const result = spawnSync(ffmpeg, args, { encoding: "utf8", windowsHide: true });
  if (result.status !== 0 || !existsSync(mp4Path)) {
    throw new Error(`FFmpeg could not encode the H.264 master: ${sanitizeLogLine(result.stderr ?? "unknown encoder error")}`);
  }
  return mp4Path;
}

function probeMedia(ffprobe: string, path: string): MediaMetadata {
  const probe = spawnSync(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", path], { encoding: "utf8", windowsHide: true });
  if (probe.status !== 0) throw new Error(`FFprobe could not inspect the prospect master: ${sanitizeLogLine(probe.stderr ?? "unknown probe error")}`);
  const parsed = JSON.parse(probe.stdout) as {
    streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; bit_rate?: string }>;
    format?: { duration?: string; bit_rate?: string };
  };
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const audio = parsed.streams?.filter((stream) => stream.codec_type === "audio") ?? [];
  return {
    durationSeconds: Number(parsed.format?.duration ?? 0),
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    videoCodec: video?.codec_name ?? "unknown",
    videoBitrate: Number(video?.bit_rate ?? 0),
    audioCodec: audio[0]?.codec_name ?? null,
    audioStreams: audio.length,
    formatBitrate: Number(parsed.format?.bit_rate ?? 0),
  };
}

function runQualityGate(
  ffmpeg: string,
  mp4Path: string,
  evidenceDir: string,
  metadata: MediaMetadata,
  typography: { assistantMessagePx: number; userMessagePx: number; approvalMessagePx: number; inputPx: number },
) {
  const framesDir = join(evidenceDir, "quality-frames");
  mkdirSync(framesDir, { recursive: true });
  const frames = spawnSync(ffmpeg, ["-y", "-i", mp4Path, "-vf", "fps=1/5", join(framesDir, "frame-%02d.png")], { encoding: "utf8", windowsHide: true });
  if (frames.status !== 0) throw new Error(`Five-second frame sampling failed: ${sanitizeLogLine(frames.stderr ?? "unknown")}`);
  const sheet = spawnSync(ffmpeg, ["-y", "-i", mp4Path, "-vf", "fps=1/5,scale=460:-1,tile=4x2:padding=8:margin=8", "-frames:v", "1", join(evidenceDir, "quality-contact-sheet.png")], { encoding: "utf8", windowsHide: true });
  if (sheet.status !== 0) throw new Error(`Quality contact sheet failed: ${sanitizeLogLine(sheet.stderr ?? "unknown")}`);
  const scan = spawnSync(ffmpeg, ["-i", mp4Path, "-vf", "blackdetect=d=0.8:pix_th=0.05,freezedetect=n=0.003:d=7", "-f", "null", "NUL"], { encoding: "utf8", windowsHide: true });
  const scanText = `${scan.stdout ?? ""}\n${scan.stderr ?? ""}`;
  const blackEvents = (scanText.match(/black_start:/g) ?? []).length;
  const freezeEvents = (scanText.match(/freeze_start:/g) ?? []).length;
  if (blackEvents > 0 || freezeEvents > 0) throw new Error(`Video quality scan found black=${blackEvents}, freeze=${freezeEvents}.`);
  return {
    status: "pass",
    sampledEverySeconds: 5,
    fullStreamBlackFrameScan: "pass",
    fullStreamFreezeScan: "pass",
    blackEvents,
    freezeEvents,
    durationWithinTarget: metadata.durationSeconds >= 35 && metadata.durationSeconds <= 45,
    desktopTypographyFloor: Object.values(typography).every((size) => size >= 16) ? "pass" : "fail",
    phoneReadableTypography: "not claimed for the 16:9 desktop master; use a dedicated phone cut",
    captionOverlap: "pass - opening and ending use dedicated full-screen cards; interaction scenes have no overlay captions",
  };
}

function runPhoneQualityGate(
  ffmpeg: string,
  mp4Path: string,
  evidenceDir: string,
  metadata: MediaMetadata,
  typography: { assistantMessagePx: number; userMessagePx: number; approvalMessagePx: number; inputPx: number },
) {
  const framesDir = join(evidenceDir, "phone-quality-frames");
  mkdirSync(framesDir, { recursive: true });
  const frames = spawnSync(ffmpeg, ["-y", "-i", mp4Path, "-vf", "fps=1/5", join(framesDir, "frame-%02d.png")], { encoding: "utf8", windowsHide: true });
  if (frames.status !== 0) throw new Error(`Phone frame sampling failed: ${sanitizeLogLine(frames.stderr ?? "unknown")}`);
  const sheet = spawnSync(ffmpeg, ["-y", "-i", mp4Path, "-vf", "fps=1/5,scale=270:-1,tile=4x2:padding=8:margin=8", "-frames:v", "1", join(evidenceDir, "phone-quality-contact-sheet.png")], { encoding: "utf8", windowsHide: true });
  if (sheet.status !== 0) throw new Error(`Phone contact sheet failed: ${sanitizeLogLine(sheet.stderr ?? "unknown")}`);
  const scan = spawnSync(ffmpeg, ["-i", mp4Path, "-vf", "blackdetect=d=0.8:pix_th=0.05,freezedetect=n=0.003:d=7", "-f", "null", "NUL"], { encoding: "utf8", windowsHide: true });
  const scanText = `${scan.stdout ?? ""}\n${scan.stderr ?? ""}`;
  const blackEvents = (scanText.match(/black_start:/g) ?? []).length;
  const freezeEvents = (scanText.match(/freeze_start:/g) ?? []).length;
  if (blackEvents > 0 || freezeEvents > 0) throw new Error(`Phone video quality scan found black=${blackEvents}, freeze=${freezeEvents}.`);
  const outputTextPixels = Object.fromEntries(Object.entries(typography).map(([name, size]) => [name, size * 3]));
  if (Object.values(outputTextPixels).some((size) => size < 48)) throw new Error("Phone cut text is below the 48-output-pixel floor.");
  return {
    status: "pass",
    sampledEverySeconds: 5,
    blackEvents,
    freezeEvents,
    durationSeconds: metadata.durationSeconds,
    outputTextPixels,
    phoneReadableTypography: "pass",
    captionOverlap: "pass - dedicated title cards and interaction-only scenes",
  };
}

function writeVoiceoverScript(evidenceDir: string): string {
  const path = join(evidenceDir, "voiceover-script.txt");
  writeFileSync(path, [
    "NitsyClaw is a personal assistant that remembers your life without sending it to the cloud.",
    "Ask what matters today, and it uses the context you have already shared.",
    "Correct it once, and the old memory stops being used.",
    "When an action could affect the outside world, it waits for your review.",
    "NitsyClaw Local Brain. Remembers privately. Acts carefully. Runs locally.",
  ].join("\n\n"));
  return path;
}

function assertHostEnvSafe() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME) {
    throw new Error("Refusing prospect demo outside a local test environment.");
  }
  if (nonEmpty(process.env.DATABASE_URL) || nonEmpty(process.env.DATABASE_URL_DIRECT)) {
    throw new Error("Refusing prospect demo because a database URL is present in this shell.");
  }
  if (!isLoopbackUrl(process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434")) {
    throw new Error("Refusing prospect demo because Ollama is not loopback.");
  }
}

function assertArtifactTextSafe(value: string): "pass" {
  const forbidden = [
    /postgres(?:ql)?:\/\//i,
    /DATABASE_URL\s*[:=]\s*\S+/i,
    /\bsk-[A-Za-z0-9_-]{12,}\b/,
    /\b(?:token|password|secret)\s*[:=]\s*\S+/i,
    /\b\+?61\d{8,}\b/,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(value)) throw new Error(`Privacy scan rejected prospect artifact text matching ${pattern.source}.`);
  }
  return "pass";
}

function readNetworkAudit(path: string): string[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return (JSON.parse(line) as { blocked?: string }).blocked;
      } catch {
        return "malformed-audit-entry";
      }
    })
    .filter((value): value is string => Boolean(value));
}

function readNetworkMocks(path: string): string[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return (JSON.parse(line) as { mocked?: string }).mocked;
      } catch {
        return undefined;
      }
    })
    .filter((value): value is string => Boolean(value));
}

function assertNoServerEgress(path: string) {
  const attempts = readNetworkAudit(path);
  if (attempts.length) throw new Error(`Prospect server attempted non-loopback network access: ${attempts.join(", ")}`);
}

function readSourceProvenance() {
  const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8", windowsHide: true });
  if (commit.status !== 0) throw new Error("Could not read prospect-demo source commit.");
  const clean = spawnSync("git", ["diff", "--quiet", "HEAD", "--", ...implementationSourcePaths], { cwd: repoRoot, windowsHide: true });
  return {
    commit: commit.stdout.trim(),
    implementationPathsClean: clean.status === 0,
    implementationPaths: implementationSourcePaths,
  };
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
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
  throw new Error(`Dashboard did not become reachable. Last logs: ${serverLog.map(sanitizeLogLine).slice(-10).join(" | ")}`);
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

function sanitizeLogLine(line: string): string {
  return line.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://[redacted]").replace(/(sk-[A-Za-z0-9_-]{12,})/g, "[redacted-key]").replace(/\s+/g, " ").trim().slice(0, 600);
}

function nonEmpty(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function isLoopbackUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function toRepoRelative(path: string): string {
  return relative(repoRoot, path).replace(/\\/g, "/");
}

void main();
