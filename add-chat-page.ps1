# Adds a /chat page to NitsyClaw dashboard.
# Run: powershell -ExecutionPolicy Bypass -File C:\Users\Nitesh\projects\NitsyClaw\add-chat-page.ps1

$ErrorActionPreference = "Stop"
$root = "C:\Users\Nitesh\projects\NitsyClaw"
$enc = New-Object System.Text.UTF8Encoding $false

if (-not (Test-Path $root)) {
    Write-Host "ERROR: NitsyClaw not found at $root" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Adding /chat page to NitsyClaw dashboard..." -ForegroundColor Cyan
Write-Host ""

# 1. Update layout to add Chat link in sidebar
$layoutPath = "$root\apps\dashboard\src\app\layout.tsx"
$layoutContent = @'
import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "NitsyClaw", description: "Personal AI control plane" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <div className="min-h-screen flex">
          <aside className="w-56 border-r border-neutral-800 p-4">
            <h1 className="text-lg font-semibold mb-6">NitsyClaw</h1>
            <nav className="flex flex-col gap-2 text-sm">
              <a className="hover:underline" href="/">Today</a>
              <a className="hover:underline" href="/chat">Chat</a>
              <a className="hover:underline" href="/conversations">Conversations</a>
              <a className="hover:underline" href="/memory">Memory</a>
              <a className="hover:underline" href="/reminders">Reminders</a>
              <a className="hover:underline" href="/expenses">Expenses</a>
              <a className="hover:underline" href="/settings">Settings</a>
            </nav>
          </aside>
          <main className="flex-1 p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
'@
[System.IO.File]::WriteAllText($layoutPath, $layoutContent, $enc)
Write-Host "  [1/4] Updated sidebar with Chat link" -ForegroundColor Green

# 2. Create the Chat page (client component with ChatGPT-style UI)
$chatDir = "$root\apps\dashboard\src\app\chat"
if (-not (Test-Path $chatDir)) { New-Item -ItemType Directory -Path $chatDir | Out-Null }
$chatPagePath = "$chatDir\page.tsx"
$chatPageContent = @'
"use client";
import { useState, useRef, useEffect } from "react";

interface Msg { role: "user" | "assistant"; content: string; }

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: next }),
      });
      const data = await r.json();
      setMessages((cur) => [...cur, { role: "assistant", content: data.reply ?? "(no reply)" }]);
    } catch (e) {
      setMessages((cur) => [...cur, { role: "assistant", content: "Error: " + (e instanceof Error ? e.message : String(e)) }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-3xl mx-auto">
      <h2 className="text-2xl font-semibold mb-4">Chat with NitsyClaw</h2>
      <p className="text-xs text-neutral-500 mb-4">
        Same brain as WhatsApp. Anything you say or ask here is logged in your Conversations and Memory.
      </p>

      <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-4" data-testid="chat-messages">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500">Start typing below. Try: <code>what's on my plate today</code></p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={
              "rounded-2xl px-4 py-2 max-w-[75%] whitespace-pre-wrap text-sm " +
              (m.role === "user"
                ? "bg-blue-600 text-white"
                : "bg-neutral-800 text-neutral-100")
            }>
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-2 bg-neutral-800 text-neutral-400 text-sm">…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="flex gap-2 border-t border-neutral-800 pt-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-neutral-500"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 text-white rounded-xl px-5 py-2 text-sm"
        >
          Send
        </button>
      </form>
    </div>
  );
}
'@
[System.IO.File]::WriteAllText($chatPagePath, $chatPageContent, $enc)
Write-Host "  [2/4] Created /chat page" -ForegroundColor Green

# 3. Create the API route that runs the agent loop
$apiDir = "$root\apps\dashboard\src\app\api\chat"
if (-not (Test-Path $apiDir)) { New-Item -ItemType Directory -Path $apiDir -Force | Out-Null }
$apiRoutePath = "$apiDir\route.ts"
$apiRouteContent = @'
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatBody {
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

const SYSTEM_PROMPT = `You are NitsyClaw, Nitesh's personal assistant.
Reply concisely and helpfully. Plain text, no markdown.
If the user asks about their reminders, expenses, calendar, or memory — note that those
features are accessed via WhatsApp commands today; suggest sending the same message via
WhatsApp for full functionality. The dashboard chat is for conversation only in v1.`;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ reply: "Server is missing ANTHROPIC_API_KEY in .env.local" }, { status: 500 });
  }

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ reply: "Bad request" }, { status: 400 });
  }
  if (!body.history?.length) {
    return NextResponse.json({ reply: "No messages provided" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });
  try {
    const resp = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: body.history.map((m) => ({ role: m.role, content: m.content })),
    });
    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
    return NextResponse.json({ reply: text || "(empty reply)" });
  } catch (e) {
    return NextResponse.json({
      reply: "LLM error: " + (e instanceof Error ? e.message : String(e)),
    }, { status: 500 });
  }
}
'@
[System.IO.File]::WriteAllText($apiRoutePath, $apiRouteContent, $enc)
Write-Host "  [3/4] Created /api/chat route" -ForegroundColor Green

# 4. Make sure dashboard has anthropic SDK installed
Write-Host "  [4/4] Installing Anthropic SDK in dashboard..." -ForegroundColor Yellow
Push-Location $root
try {
    pnpm --filter @nitsyclaw/dashboard add "@anthropic-ai/sdk" 2>&1 | Out-String | Write-Host
} finally {
    Pop-Location
}
Write-Host "  done" -ForegroundColor Green

Write-Host ""
Write-Host "===================================" -ForegroundColor Cyan
Write-Host " Chat page added!" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " Open: http://localhost:3000/chat" -ForegroundColor White
Write-Host ""
Write-Host " (Dashboard auto-reloads with the new page. If not, hit Ctrl+Shift+R in browser.)" -ForegroundColor Yellow
Write-Host ""
