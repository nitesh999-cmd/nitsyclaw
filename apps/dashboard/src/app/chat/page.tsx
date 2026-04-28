"use client";
import { useState, useRef, useEffect } from "react";

interface Msg { role: "user" | "assistant"; content: string; }

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [recording, setRecording] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef<unknown>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Web Speech API setup (feature_request fr_ff3ca79f). Chrome/Edge/Safari only.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;
    setVoiceSupported(true);
    const r = new SR();
    r.continuous = false;
    r.interimResults = true;
    r.lang = "en-AU";
    r.onresult = (e: SpeechRecognitionEventLike) => {
      const t = Array.from(e.results)
        .map((res) => res[0]?.transcript ?? "")
        .join("");
      setInput(t);
    };
    r.onend = () => setRecording(false);
    r.onerror = () => setRecording(false);
    recognitionRef.current = r;
  }, []);

  function toggleVoice() {
    const r = recognitionRef.current as SpeechRecognitionLike | null;
    if (!r) {
      alert("Speech recognition isn't supported in this browser. Try Chrome, Edge, or Safari.");
      return;
    }
    if (recording) {
      try { r.stop(); } catch {}
    } else {
      setInput("");
      try {
        r.start();
        setRecording(true);
      } catch {
        // Already started or permission denied.
      }
    }
  }

  // Hydrate from cross-surface history on mount (WhatsApp + dashboard combined).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/chat/history?limit=20", { cache: "no-store" });
        const data = await r.json();
        if (!cancelled && Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
      } catch {
        // Non-fatal — show empty state.
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
        {loadingHistory && (
          <p className="text-sm text-neutral-500">Loading conversation history...</p>
        )}
        {!loadingHistory && messages.length === 0 && (
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
            <div className="rounded-2xl px-4 py-2 bg-neutral-800 text-neutral-400 text-sm">â€¦</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="flex gap-2 border-t border-neutral-800 pt-4"
      >
        {voiceSupported && (
          <button
            type="button"
            onClick={toggleVoice}
            disabled={busy}
            aria-label={recording ? "Stop recording" : "Start voice input"}
            className={
              "rounded-xl px-4 py-2 text-sm transition disabled:opacity-50 " +
              (recording
                ? "bg-red-600 hover:bg-red-500 text-white animate-pulse"
                : "bg-neutral-800 hover:bg-neutral-700 text-neutral-200")
            }
          >
            {recording ? "● Stop" : "🎤"}
          </button>
        )}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={recording ? "Listening..." : "Type a message..."}
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

// Minimal types for the Web Speech API (browser-vendor specific, not in lib.dom).
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<{ [index: number]: { transcript: string } }>;
}