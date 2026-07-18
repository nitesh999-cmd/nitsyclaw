"use client";

import { useEffect, useRef, useState } from "react";

interface DemoMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  indicator?: string;
  approval?: ApprovalCard;
}

interface ApprovalCard {
  title: string;
  recipient: string;
  message: string;
  status: "waiting";
  actionCalls: number;
}

interface DemoResponse {
  reply?: string;
  indicator?: string;
  approval?: ApprovalCard;
  error?: string;
}

const STARTER_MESSAGE: DemoMessage = {
  id: "welcome",
  role: "assistant",
  text: "What can I help you remember, decide, or prepare today?",
};

export default function ProspectDemoPage() {
  const [messages, setMessages] = useState<DemoMessage[]>([STARTER_MESSAGE]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void callDemo("reset", "").then((response) => {
      if (cancelled) return;
      if (response.error) setError(response.error);
      else setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy || !ready) return;
    const action = classifyAction(text);
    const userMessage: DemoMessage = { id: `user-${Date.now()}`, role: "user", text };
    setInput("");
    if (!action) {
      setMessages((current) => [...current, userMessage, {
        id: `assistant-preview-${Date.now()}`,
        role: "assistant",
        text: "This private preview demonstrates today’s focus, a memory correction, and a reviewed message. Try one of the example requests.",
        indicator: "Preview only — no external action",
      }]);
      return;
    }
    setMessages((current) => [...current, userMessage]);
    setBusy(true);
    setError("");
    try {
      const response = await callDemo(action, text);
      if (response.error || !response.reply) throw new Error(response.error ?? "No reply was returned.");
      setMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: response.reply ?? "",
        indicator: response.indicator,
        approval: response.approval,
      }]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The private preview could not respond.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-[#f4efe6] text-[#171915]" data-testid="prospect-demo-shell">
      <div className="pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" style={{
        backgroundImage: "radial-gradient(circle at 12% 18%, rgba(62, 111, 80, .11), transparent 31%), radial-gradient(circle at 88% 82%, rgba(178, 126, 67, .10), transparent 29%)",
      }} />

      <header className="relative z-10 flex h-16 items-center justify-between border-b border-[#d9d3c8] bg-[#fbf8f2]/95 px-4 backdrop-blur-xl sm:h-[76px] sm:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#214b36] text-sm font-bold text-white shadow-[0_8px_24px_rgba(33,75,54,.18)]">N</div>
          <div>
            <div className="text-[17px] font-semibold">NitsyClaw</div>
            <div className="text-xs text-[#6b6e66]">Private life admin</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-[#d8c7a8] bg-[#fff9ec] px-3 py-1.5 text-xs font-semibold text-[#79582d] sm:inline-flex">Private preview</span>
          <span className="flex items-center gap-2 text-sm font-medium text-[#355d46]" data-testid="prospect-demo-ready">
            <span className={`h-2 w-2 rounded-full ${ready ? "bg-[#3d8a5d]" : "bg-[#c99b52]"}`} />
            {ready ? "Ready on this laptop" : "Starting privately"}
          </span>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid h-[calc(100vh-64px)] max-w-[1480px] grid-cols-1 gap-3 p-3 sm:h-[calc(100vh-76px)] sm:grid-cols-[minmax(0,1fr)_330px] sm:gap-8 sm:px-10 sm:py-8">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-[24px] border border-[#d9d3c8] bg-[#fffdf9] shadow-[0_28px_80px_rgba(61,48,31,.10)]">
          <div className="border-b border-[#e4dfd6] px-4 py-3 sm:px-8 sm:py-6">
            <p className="text-xs font-semibold uppercase text-[#49715a]">Your private assistant</p>
            <h1 className="mt-1 text-[22px] font-semibold leading-tight sm:text-[28px]">What would you like handled?</h1>
            <p className="mt-1 text-[14px] text-[#6b6e66] sm:mt-2 sm:text-[15px]">It remembers useful context, learns corrections, and waits before acting.</p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-8 sm:py-6" data-testid="prospect-demo-conversation">
            <div className="mx-auto flex max-w-[820px] flex-col gap-5">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={message.role === "user" ? "ml-auto max-w-[88%] sm:max-w-[76%]" : "mr-auto max-w-[92%] sm:max-w-[82%]"}
                  data-testid={message.role === "assistant" ? "prospect-assistant-message" : "prospect-user-message"}
                >
                  <div className={message.role === "user"
                    ? "rounded-[20px] rounded-br-md bg-[#214b36] px-5 py-3.5 text-[17px] leading-7 text-white shadow-sm"
                    : "rounded-[20px] rounded-bl-md border border-[#ded8cd] bg-[#f8f4ec] px-5 py-4 text-[17px] leading-7 text-[#242720] shadow-sm"
                  }>
                    <p className="whitespace-pre-line">{message.text}</p>
                  </div>
                  {message.indicator ? (
                    <div className="mt-2 flex items-center gap-2 pl-2 text-[13px] font-medium text-[#49715a]" data-testid="prospect-private-indicator">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#e5efe8] text-[11px]">OK</span>
                      {message.indicator}
                    </div>
                  ) : null}
                  {message.approval ? <ApprovalPreview approval={message.approval} /> : null}
                </article>
              ))}
              {busy ? (
                <div className="mr-auto rounded-[20px] rounded-bl-md border border-[#ded8cd] bg-[#f8f4ec] px-5 py-4" data-testid="prospect-demo-thinking">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#596157]">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[#49715a]" />
                    Thinking on this laptop
                  </div>
                </div>
              ) : null}
              <div ref={endRef} />
            </div>
          </div>

          <div className="border-t border-[#e4dfd6] bg-[#fbf8f2] px-3 py-3 sm:px-8 sm:py-5">
            {error ? <p className="mb-3 text-sm font-medium text-[#9c382d]" role="alert">{error}</p> : null}
            <div className="mx-auto flex max-w-[820px] items-end gap-3 rounded-2xl border border-[#cfc8bc] bg-white p-2 shadow-[0_10px_30px_rgba(61,48,31,.08)] focus-within:border-[#5d8069] focus-within:ring-4 focus-within:ring-[#5d8069]/10">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                className="min-h-[50px] flex-1 resize-none bg-transparent px-3 py-3 text-[17px] leading-6 outline-none placeholder:text-[#9a9c96]"
                placeholder="Say what you need..."
                aria-label="Ask NitsyClaw"
                disabled={!ready || busy}
                data-testid="prospect-demo-input"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={!ready || busy || !input.trim()}
                className="min-h-[50px] rounded-xl bg-[#214b36] px-6 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(33,75,54,.2)] transition-colors hover:bg-[#173b2a] disabled:cursor-not-allowed disabled:bg-[#b9bdb8]"
                data-testid="prospect-demo-send"
              >
                Send
              </button>
            </div>
          </div>
        </section>

        <aside className="hidden flex-col justify-between py-2 sm:flex" aria-label="Private preview details">
          <div>
            <p className="text-xs font-semibold uppercase text-[#49715a]">Private preview</p>
            <h2 className="mt-3 text-[30px] font-semibold leading-[1.15]">A personal assistant that remembers your life without sending it to the cloud.</h2>
            <p className="mt-4 text-[15px] leading-6 text-[#686b64]">Fictional demonstration data only. Nothing here reaches a real person or account.</p>
          </div>

          <div className="space-y-3">
            <TrustRow number="01" title="Remembers privately" detail="Useful context stays on this laptop." />
            <TrustRow number="02" title="Learns corrections" detail="New facts replace stale ones." />
            <TrustRow number="03" title="Acts carefully" detail="External actions wait for your review." />
          </div>

          <div className="rounded-2xl border border-[#d5cec2] bg-[#fbf8f2] p-5">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>Local AI</span>
              <span className="text-[#49715a]">No cloud fallback</span>
            </div>
            <p className="mt-2 text-sm leading-5 text-[#70736c]">Owner-only preview. Not a public product release.</p>
          </div>
        </aside>
      </main>
    </div>
  );
}

function ApprovalPreview({ approval }: { approval: ApprovalCard }) {
  const [notice, setNotice] = useState("Nothing has been sent");

  return (
    <div className="mt-3 w-[560px] max-w-full rounded-2xl border border-[#d7c8ad] bg-[#fffaf0] p-5 shadow-[0_14px_36px_rgba(84,63,32,.10)]" data-testid="prospect-approval-card">
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-xs font-semibold uppercase text-[#8a642f]">{approval.title}</p>
          <p className="mt-2 text-sm text-[#69665e]">To {approval.recipient}</p>
          <p className="mt-1 text-[16px] leading-6 text-[#282820]">“{approval.message}”</p>
        </div>
        <span className="shrink-0 rounded-full border border-[#d8c7a8] bg-white px-3 py-1 text-xs font-semibold text-[#79582d]">Waiting</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto]">
        <button type="button" onClick={() => setNotice("Preview only. Nothing was sent.")} className="col-span-2 min-h-11 rounded-xl bg-[#214b36] px-4 text-sm font-semibold text-white sm:col-span-1">Approve and send</button>
        <button type="button" onClick={() => setNotice("Editing stays local in this private preview.")} className="min-h-11 rounded-xl border border-[#cbc4b8] bg-white px-4 text-sm font-semibold text-[#33362f]">Edit</button>
        <button type="button" onClick={() => setNotice("Draft cancelled. Nothing was sent.")} className="min-h-11 rounded-xl border border-[#cbc4b8] bg-white px-4 text-sm font-semibold text-[#33362f]">Cancel</button>
      </div>
      <p className="mt-3 text-center text-xs font-medium text-[#6d735f]" data-testid="prospect-nothing-sent">{notice}</p>
    </div>
  );
}

function TrustRow({ number, title, detail }: { number: string; title: string; detail: string }) {
  return (
    <div className="grid grid-cols-[38px_1fr] gap-3 border-t border-[#d8d1c5] py-4">
      <span className="text-xs font-semibold text-[#789080]">{number}</span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-sm leading-5 text-[#6c6f68]">{detail}</p>
      </div>
    </div>
  );
}

function classifyAction(text: string): "focus" | "correct" | "recall" | "propose" | null {
  if (/what should I focus on today/i.test(text)) return "focus";
  if (/^correction:/i.test(text)) return "correct";
  if (/what do I drink/i.test(text)) return "recall";
  if (/message Alex/i.test(text)) return "propose";
  return null;
}

async function callDemo(action: string, text: string): Promise<DemoResponse> {
  const response = await fetch("/api/local-brain/prospect-demo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, text }),
    cache: "no-store",
  });
  const body = await response.json() as DemoResponse;
  if (!response.ok) return { error: body.error ?? `Private preview unavailable (${response.status}).` };
  return body;
}
