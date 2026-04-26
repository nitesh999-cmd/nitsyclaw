# NitsyClaw NUCLEAR fix-and-go script
# Run: powershell -ExecutionPolicy Bypass -File C:\Users\Nitesh\projects\NitsyClaw\nuke-and-go.ps1
#
# What it does:
#   1. Kills zombie node + chromium processes
#   2. Strips BOM from every package.json + tsconfig.json
#   3. Validates every package.json is parseable JSON
#   4. Overwrites apps/bot/src/adapters.ts with the known-good version (so OpenAI imports never go missing again)
#   5. Clears stale build caches + wa-session locks
#   6. Launches dashboard + bot in two new windows
#
# Idempotent. Safe to run anytime things break.

$ErrorActionPreference = "Stop"
$root = "C:\Users\Nitesh\projects\NitsyClaw"

if (-not (Test-Path $root)) {
    Write-Host "ERROR: Project not found at $root" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " NitsyClaw nuke-and-go" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$enc = New-Object System.Text.UTF8Encoding $false

# 1. Kill zombie processes
Write-Host "[1/6] Killing zombie node + chromium..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*Puppeteer*" -or $_.Path -like "*wa-session*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Write-Host "  done" -ForegroundColor Green

# 2. Strip BOM from every JSON config file
Write-Host "[2/6] Stripping BOM from package.json + tsconfig.json files..." -ForegroundColor Yellow
$jsonFiles = Get-ChildItem -Path $root -Recurse -Include "package.json","tsconfig.json","tsconfig.base.json" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notlike "*node_modules*" }

$fixed = 0
foreach ($f in $jsonFiles) {
    $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) {
        $content = [System.IO.File]::ReadAllText($f.FullName).TrimStart([char]0xFEFF)
        [System.IO.File]::WriteAllText($f.FullName, $content, $enc)
        Write-Host "  fixed: $($f.FullName.Substring($root.Length+1))" -ForegroundColor Green
        $fixed++
    }
}
Write-Host "  $fixed file(s) had BOM, now clean" -ForegroundColor Green

# 3. Validate every package.json
Write-Host "[3/6] Validating package.json JSON..." -ForegroundColor Yellow
$packageJsons = $jsonFiles | Where-Object { $_.Name -eq "package.json" }
$bad = @()
foreach ($f in $packageJsons) {
    try {
        Get-Content $f.FullName -Raw | ConvertFrom-Json | Out-Null
    } catch {
        $bad += $f.FullName
        Write-Host "  INVALID: $($f.FullName.Substring($root.Length+1))" -ForegroundColor Red
        Write-Host "    $($_.Exception.Message)" -ForegroundColor Red
    }
}
if ($bad.Count -gt 0) {
    Write-Host ""
    Write-Host "ERROR: $($bad.Count) package.json file(s) are invalid JSON. Cannot continue." -ForegroundColor Red
    exit 1
}
Write-Host "  $($packageJsons.Count) file(s) all valid" -ForegroundColor Green

# 4. Overwrite adapters.ts with the known-good version
Write-Host "[4/6] Restoring known-good adapters.ts..." -ForegroundColor Yellow
$adaptersPath = "$root\apps\bot\src\adapters.ts"
$adaptersContent = @'
// Concrete adapters for AgentDeps (LLM, transcriber, web, calendar, image, embedder).
// Real-world integrations live here. In tests these are replaced with fakes.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { google } from "googleapis";
import { loadOAuthClient, hasGoogleToken } from "./google-auth.js";
import type {
  AgentDeps,
  CalendarClient,
  Embedder,
  ImageAnalyzer,
  LlmClient,
  Transcriber,
  WebSearcher,
} from "@nitsyclaw/shared/agent";

export function makeAnthropicLlm(apiKey: string, model: string): LlmClient {
  const client = new Anthropic({ apiKey });
  return {
    async complete({ system, messages, maxTokens }) {
      const resp = await client.messages.create({
        model,
        system,
        max_tokens: maxTokens ?? 1024,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });
      const text = resp.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");
      return { text };
    },
    async toolStep({ system, messages, tools }) {
      const resp = await client.messages.create({
        model,
        system,
        max_tokens: 1024,
        tools: tools as Anthropic.Tool[],
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });
      const toolCalls = resp.content
        .filter((b) => b.type === "tool_use")
        .map((b) => {
          const tu = b as { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
          return { id: tu.id, name: tu.name, input: tu.input };
        });
      const text = resp.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");
      return {
        stopReason: (resp.stop_reason ?? "end_turn") as "end_turn" | "tool_use" | "max_tokens",
        toolCalls,
        text,
      };
    },
  };
}

export function makeOpenAiTranscriber(apiKey: string, model: string): Transcriber {
  const client = new OpenAI({ apiKey });
  return {
    async transcribe(audio: Buffer, mimetype: string) {
      const { toFile } = await import("openai/uploads");
      const subtype = (mimetype.split("/")[1] ?? "ogg").split(";")[0];
      const extMap: Record<string, string> = {
        ogg: "ogg", oga: "oga", opus: "ogg", mpeg: "mp3", mp3: "mp3",
        wav: "wav", webm: "webm", m4a: "m4a", mp4: "mp4", flac: "flac",
      };
      const ext = extMap[subtype] ?? "ogg";
      const file = await toFile(audio, "audio." + ext, { type: mimetype.split(";")[0] });
      const out = await client.audio.transcriptions.create({ file, model });
      return out.text ?? "";
    },
  };
}

export function makeOpenAiEmbedder(apiKey: string): Embedder {
  const client = new OpenAI({ apiKey });
  return {
    async embed(text: string) {
      const out = await client.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
      });
      return out.data[0]!.embedding;
    },
  };
}

export function makeAnthropicImageAnalyzer(apiKey: string, model: string): ImageAnalyzer {
  const client = new Anthropic({ apiKey });
  return {
    async extractReceipt(image: Buffer, mimetype: string) {
      const resp = await client.messages.create({
        model,
        max_tokens: 400,
        system: 'Extract receipt fields. Return strict JSON: {"amount": number, "currency": "INR"|"USD", "merchant": string, "date": "YYYY-MM-DD", "rawText": string}. Use null for unknowns.',
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimetype as "image/jpeg" | "image/png" | "image/webp",
                  data: image.toString("base64"),
                },
              },
              { type: "text", text: "Extract the receipt fields." },
            ],
          },
        ],
      });
      const text = resp.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");
      try {
        const json = JSON.parse(text);
        return {
          amount: typeof json.amount === "number" ? json.amount : undefined,
          currency: json.currency ?? undefined,
          merchant: json.merchant ?? undefined,
          date: json.date ? new Date(json.date) : undefined,
          rawText: json.rawText ?? text,
        };
      } catch {
        return { rawText: text };
      }
    },
  };
}

export const stubWebSearch: WebSearcher = {
  async search(query: string) {
    return [
      {
        title: "Web search not configured - query: " + query,
        url: "https://example.com",
        snippet: "Configure WEB_SEARCH_PROVIDER in .env.local to enable real web search.",
      },
    ];
  },
};

export const realCalendar: CalendarClient = {
  async suggestSlots({ durationMin, window }) {
    if (!hasGoogleToken()) return [window.start];
    const auth = loadOAuthClient();
    const cal = google.calendar({ version: "v3", auth });
    const fb = await cal.freebusy.query({
      requestBody: {
        timeMin: window.start.toISOString(),
        timeMax: window.end.toISOString(),
        items: [{ id: "primary" }],
      },
    });
    const busy = (fb.data.calendars?.primary?.busy ?? []).map((b) => ({
      start: new Date(b.start ?? ""),
      end: new Date(b.end ?? ""),
    }));
    const slots: Date[] = [];
    const step = 30 * 60 * 1000;
    const dur = durationMin * 60 * 1000;
    for (let t = window.start.getTime(); t + dur <= window.end.getTime() && slots.length < 3; t += step) {
      const slotEnd = t + dur;
      const conflicts = busy.some((b) => t < b.end.getTime() && slotEnd > b.start.getTime());
      if (!conflicts) slots.push(new Date(t));
    }
    return slots.length ? slots : [window.start];
  },

  async createEvent({ title, start, durationMin, participants, description }) {
    if (!hasGoogleToken()) return { id: "no-token-" + start.toISOString() };
    const auth = loadOAuthClient();
    const cal = google.calendar({ version: "v3", auth });
    const end = new Date(start.getTime() + durationMin * 60 * 1000);
    const ev = await cal.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: title,
        description,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        attendees: participants.map((email) => ({ email })),
      },
      sendUpdates: "all",
    });
    return { id: ev.data.id ?? "", htmlLink: ev.data.htmlLink ?? undefined };
  },

  async listEventsToday(timezone: string) {
    if (!hasGoogleToken()) return [];
    const auth = loadOAuthClient();
    const cal = google.calendar({ version: "v3", auth });
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const list = await cal.events.list({
      calendarId: "primary",
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      timeZone: timezone,
    });
    return (list.data.items ?? []).map((e) => ({
      title: e.summary ?? "(no title)",
      start: new Date(e.start?.dateTime ?? e.start?.date ?? Date.now()),
    }));
  },
};

export const stubCalendar = realCalendar;

export interface BotConfigEnv {
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_MODEL: string;
  OPENAI_API_KEY?: string;
  TRANSCRIPTION_MODEL: string;
  TIMEZONE: string;
}

export function buildAgentDeps(args: {
  env: BotConfigEnv;
  db: AgentDeps["db"];
  whatsapp: AgentDeps["whatsapp"];
  now?: () => Date;
}): AgentDeps {
  const llm = makeAnthropicLlm(args.env.ANTHROPIC_API_KEY, args.env.ANTHROPIC_MODEL);
  const transcriber = args.env.OPENAI_API_KEY
    ? makeOpenAiTranscriber(args.env.OPENAI_API_KEY, args.env.TRANSCRIPTION_MODEL)
    : { async transcribe() { throw new Error("OPENAI_API_KEY not set"); } };
  const embedder = args.env.OPENAI_API_KEY
    ? makeOpenAiEmbedder(args.env.OPENAI_API_KEY)
    : { async embed() { return []; } };
  const imageAnalyzer = makeAnthropicImageAnalyzer(args.env.ANTHROPIC_API_KEY, args.env.ANTHROPIC_MODEL);
  return {
    db: args.db,
    whatsapp: args.whatsapp,
    llm,
    transcriber,
    webSearch: stubWebSearch,
    calendar: realCalendar,
    imageAnalyzer,
    embedder,
    now: args.now ?? (() => new Date()),
    timezone: args.env.TIMEZONE,
  };
}
'@

[System.IO.File]::WriteAllText($adaptersPath, $adaptersContent, $enc)
Write-Host "  adapters.ts restored ($([System.IO.File]::ReadAllText($adaptersPath).Length) chars)" -ForegroundColor Green

# 5. Clear caches + wa-session locks
Write-Host "[5/6] Clearing stale caches + locks..." -ForegroundColor Yellow
Remove-Item -Recurse -Force "$root\apps\dashboard\.next" -ErrorAction SilentlyContinue
Remove-Item -Force "$root\apps\bot\.wa-session\session\SingletonLock" -ErrorAction SilentlyContinue
Remove-Item -Force "$root\apps\bot\.wa-session\session\SingletonCookie" -ErrorAction SilentlyContinue
Remove-Item -Force "$root\apps\bot\.wa-session\session\SingletonSocket" -ErrorAction SilentlyContinue
Write-Host "  done" -ForegroundColor Green

# 6. Launch
Write-Host "[6/6] Launching dashboard + bot..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit","-Command","cd $root; Write-Host '== DASHBOARD ==' -ForegroundColor Cyan; pnpm dashboard"
Start-Sleep -Seconds 3
Start-Process powershell -ArgumentList "-NoExit","-Command","cd $root; Write-Host '== BOT ==' -ForegroundColor Cyan; pnpm bot:loop"
Write-Host "  two windows opened" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Done." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " Watch the BOT window for [boot] WhatsApp ready" -ForegroundColor White
Write-Host " Then on WhatsApp: send 'brief me'" -ForegroundColor White
Write-Host ""
