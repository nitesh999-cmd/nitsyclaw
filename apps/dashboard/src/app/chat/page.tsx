"use client";
import { useState, useRef, useEffect } from "react";
import { CHAT_QUICK_ACTIONS } from "../../lib/chat-quick-actions";
import { speechRecognitionErrorMessage } from "../../lib/voice-errors";

interface Msg {
  role: "user" | "assistant";
  content: string;
  surface?: "whatsapp" | "dashboard";
  createdAt?: string;
}

const SPEECH_LANGUAGES = [
  { label: "English (Australia)", value: "en-AU" },
  { label: "English (US)", value: "en-US" },
  { label: "Hindi / Hinglish", value: "hi-IN" },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [recording, setRecording] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  // Voice OUT (text-to-speech) state — uses native browser Web Speech API,
  // zero latency, zero API key. iOS Apple voices are best; desktop Chrome
  // gets ~200 Google voices; Firefox uses OS voices.
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceOut, setVoiceOut] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [speechLanguage, setSpeechLanguage] = useState("en-AU");
  const recognitionRef = useRef<unknown>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Voice OUT — load voices + saved preferences from localStorage.
  // Chrome/Safari load voices asynchronously; getVoices() may return [] on
  // first call. Listen for voiceschanged AND poll once after a short delay.
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const update = () => {
      const v = window.speechSynthesis.getVoices();
      setVoices(v);
      // Auto-pick best English voice if user hasn't chosen one yet.
      const saved = localStorage.getItem("nitsyclaw-voice");
      if (!saved && v.length > 0) {
        const pick =
          v.find((x) => x.lang === "en-AU" && x.default) ||
          v.find((x) => x.lang === "en-AU") ||
          v.find((x) => x.lang === "en-US" && x.default) ||
          v.find((x) => x.lang === "en-US") ||
          v.find((x) => x.lang.startsWith("en")) ||
          v.find((x) => x.default) ||
          v[0];
        if (pick) setSelectedVoice(pick.name);
      }
    };
    update();
    window.speechSynthesis.onvoiceschanged = update;
    setTimeout(update, 250); // Chrome lazy-loads voices
    setVoiceOut(localStorage.getItem("nitsyclaw-voice-out") !== "false");
    const saved = localStorage.getItem("nitsyclaw-voice") || "";
    if (saved) setSelectedVoice(saved);
    const savedSpeechLanguage = localStorage.getItem("nitsyclaw-speech-language") || "";
    if (SPEECH_LANGUAGES.some((language) => language.value === savedSpeechLanguage)) {
      setSpeechLanguage(savedSpeechLanguage);
    }
  }, []);

  /** Queue an utterance. Does NOT cancel in-progress utterances —
   *  callers responsible for cancelling at start of new reply (so streamed
   *  sentences can queue up naturally without each one cutting off the prior). */
  function speak(text: string) {
    if (!voiceOut || typeof window === "undefined" || !window.speechSynthesis) {
      return;
    }
    // Strip markdown / decoration so TTS doesn't read "asterisk asterisk"
    const clean = text
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/^#+\s+/gm, "")
      .trim();
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean.slice(0, 1500));
    if (selectedVoice) {
      const match = voices.find((v) => v.name === selectedVoice);
      if (match) u.voice = match;
    }
    u.rate = 1.05;
    u.pitch = 1.0;
    u.onerror = () => console.warn("[tts] speech failed");
    window.speechSynthesis.speak(u);
  }

  function toggleVoiceOut() {
    const next = !voiceOut;
    setVoiceOut(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("nitsyclaw-voice-out", String(next));
      if (!next && window.speechSynthesis) window.speechSynthesis.cancel();
    }
  }

  function pickVoice(name: string) {
    setSelectedVoice(name);
    if (typeof window !== "undefined") localStorage.setItem("nitsyclaw-voice", name);
    // Preview
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance("Hi Nitesh. This is how I'll sound.");
      const v = voices.find((x) => x.name === name);
      if (v) u.voice = v;
      window.speechSynthesis.speak(u);
    }
  }

  function pickSpeechLanguage(value: string) {
    setSpeechLanguage(value);
    if (typeof window !== "undefined") localStorage.setItem("nitsyclaw-speech-language", value);
    const r = recognitionRef.current as SpeechRecognitionLike | null;
    if (r) r.lang = value;
  }

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
    r.lang = speechLanguage;
    r.onresult = (e: SpeechRecognitionEventLike) => {
      const t = Array.from(e.results)
        .map((res) => res[0]?.transcript ?? "")
        .join("");
      setInput(t);
    };
    r.onend = () => setRecording(false);
    r.onerror = (event: SpeechRecognitionErrorEventLike) => {
      setRecording(false);
      setVoiceError(speechRecognitionErrorMessage(event.error));
    };
    recognitionRef.current = r;
  }, [speechLanguage]);

  function toggleVoice() {
    const r = recognitionRef.current as SpeechRecognitionLike | null;
    if (!r) {
      alert("Speech recognition isn't supported in this browser. Try Chrome, Edge, or Safari.");
      return;
    }
    if (recording) {
      try {
        r.stop();
      } catch {
        setRecording(false);
      }
    } else {
      setInput("");
      setVoiceError("");
      try {
        r.lang = speechLanguage;
        r.start();
        setRecording(true);
      } catch {
        setRecording(false);
        setVoiceError("Microphone could not start. Check browser permission and try again.");
      }
    }
  }

  // Hydrate from cross-surface history on mount (WhatsApp + dashboard combined).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/chat/history?limit=20", { cache: "no-store" });
        const data = await r.json() as { messages?: Msg[]; error?: string };
        if (!r.ok || data.error) {
          throw new Error(data.error || `History unavailable (${r.status})`);
        }
        if (!cancelled && Array.isArray(data.messages)) {
          setMessages(data.messages);
          setHistoryError("");
        }
      } catch {
        if (!cancelled) {
          console.warn("[chat] history load failed");
          setHistoryError("Unable to load chat history. New messages still work.");
        }
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const userMsg: Msg = { role: "user", content: text };
    const next: Msg[] = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setBusy(true);

    // Cancel any in-progress speech from a prior reply before this new one.
    // Also: prime the audio context with a synchronous empty utterance INSIDE
    // the click handler. iOS Safari (and some Android browsers) only allow
    // speechSynthesis after the FIRST speak() in a session is triggered by
    // a user gesture. The streaming reader fires speak() in async callbacks
    // that have lost the gesture context — without this primer, subsequent
    // speak() calls are silently dropped on iOS.
    try {
      if (typeof window !== "undefined" && window.speechSynthesis && voiceOut) {
        window.speechSynthesis.cancel();
        const primer = new SpeechSynthesisUtterance(" ");
        primer.volume = 0;
        window.speechSynthesis.speak(primer);
      }
    } catch {
      console.warn("[tts] primer failed");
    }

    // Append empty assistant message that we'll fill via streaming.
    setMessages((cur) => [...cur, { role: "assistant", content: "" }]);

    // Defensive helper: find the LAST assistant message in the array and
    // replace its content. Doesn't assume it's at index length-1 (state
    // ordering edge cases can put user message there in some races).
    // If no assistant exists, appends a new one. Either way the reply lands.
    const setAssistantContent = (content: string) => {
      setMessages((cur) => {
        const copy = [...cur];
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i]?.role === "assistant") {
            copy[i] = { role: "assistant", content };
            return copy;
          }
        }
        copy.push({ role: "assistant", content });
        return copy;
      });
    };

    let spokenSoFar = 0; // index in finalText we've already passed to TTS
    let finalText = "";
    let sawError = false;

    try {
      const r = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: next }),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      if (!r.body) throw new Error("No response body");
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const handleSpeakBoundary = () => {
        if (!voiceOut) return;
        // Find sentence terminator (. ! ? \n) past spokenSoFar
        const tail = finalText.slice(spokenSoFar);
        const m = tail.match(/.+?[.!?\n](?:\s|$)/);
        if (m) {
          const sentence = m[0].trim();
          if (sentence) speak(sentence);
          spokenSoFar += m[0].length;
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let event: { type: string; [k: string]: unknown };
          try { event = JSON.parse(line); } catch {
            console.warn("[chat] skipped unparseable stream line");
            continue;
          }
          if (event.type === "text" && typeof event.delta === "string") {
            finalText += event.delta;
            setAssistantContent(finalText);
            handleSpeakBoundary();
          } else if (event.type === "receipt" && typeof event.text === "string" && !finalText) {
            setAssistantContent(event.text);
          } else if (event.type === "done") {
            // Speak any remaining unspoken text (final fragment without terminator)
            const remaining = finalText.slice(spokenSoFar).trim();
            if (remaining && voiceOut) speak(remaining);
            // /addfeature path returns reply directly under "reply"
            if (typeof event.reply === "string" && !finalText) {
              finalText = event.reply;
              setAssistantContent(finalText);
              if (voiceOut) speak(finalText);
            }
          } else if (event.type === "error" && typeof event.message === "string") {
            sawError = true;
            setAssistantContent(event.message);
          }
          // tool / tool_result events ignored visually for now (could show indicator later)
        }
      }
      // Fallback: if stream finished with no text AND no error event was shown,
      // hit the non-streaming /api/chat endpoint to get *something* visible.
      // This catches edge cases where chunked streaming silently fails (proxy,
      // browser quirk, malformed response) — both endpoints run the same agent.
      if (!finalText && !sawError) {
        console.warn("[chat] empty stream — falling back to /api/chat");
        try {
          const fb = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ history: next }),
          });
          const data = (await fb.json()) as { reply?: string };
          const reply = data.reply ?? "(empty reply)";
          finalText = reply;
          setAssistantContent(reply);
          if (voiceOut) speak(reply);
        } catch {
          console.warn("[chat] fallback failed");
          setAssistantContent("I could not get a reply. Try again shortly.");
        }
      }
    } catch {
      console.warn("[chat] stream failed");
      setAssistantContent("I could not get a reply. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="nc-page flex h-[calc(100vh-3rem)] max-w-5xl flex-col">
      <section className="nc-hero mb-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="nc-eyebrow">Home help</div>
            <h2 className="mt-2 text-3xl font-semibold">Chat with NitsyClaw</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Ask for help with messages, bills, calls, travel days, renewals, and the small things that pile up.
            </p>
          </div>
        {voices.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleVoiceOut}
              aria-label={voiceOut ? "Mute voice output" : "Unmute voice output"}
              className={
                "nc-button min-h-9 px-3 py-1.5 text-xs " +
                (voiceOut
                  ? "border-cyan-500/70 bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                  : "border-slate-700 bg-slate-900 text-slate-300")
              }
            >
              {voiceOut ? "Voice on" : "Voice off"}
            </button>
            <button
              type="button"
              onClick={() => setShowVoicePicker((v) => !v)}
              className="nc-button min-h-9 px-3 py-1.5 text-xs"
            >
              Voice
            </button>
            <label className="sr-only" htmlFor="speech-language">Speech language</label>
            <select
              id="speech-language"
              value={speechLanguage}
              onChange={(e) => pickSpeechLanguage(e.target.value)}
              className="nc-input min-h-9 w-40 px-2 py-1 text-xs"
            >
              {SPEECH_LANGUAGES.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </select>
          </div>
        )}
        </div>
      </section>
      {showVoicePicker && voices.length > 0 && (
        <div className="mb-4 grid max-h-64 grid-cols-1 gap-1 overflow-auto border border-slate-800 bg-slate-950 p-2 sm:grid-cols-2">
          {voices
            .slice()
            .sort((a, b) => (a.lang.startsWith("en") === b.lang.startsWith("en") ? a.name.localeCompare(b.name) : a.lang.startsWith("en") ? -1 : 1))
            .map((v) => (
              <button
                key={`${v.name}-${v.lang}`}
                type="button"
                onClick={() => pickVoice(v.name)}
                className={
                  "text-left text-xs rounded-lg px-3 py-2 border transition " +
                  (selectedVoice === v.name
                    ? "border-cyan-500 bg-cyan-950/30"
                    : "border-slate-800 hover:border-slate-700 hover:bg-slate-900")
                }
              >
                <div className="font-medium text-slate-100">{v.name}</div>
                <div className="text-[10px] text-slate-500">{v.lang} {v.localService ? "- system" : "- remote"}</div>
              </button>
            ))}
        </div>
      )}
      {historyError ? (
        <div className="mb-3 border border-amber-900 bg-amber-950/30 p-3 text-sm text-amber-200" role="status">
          Could not sync recent WhatsApp/dashboard history. New messages still work.
        </div>
      ) : null}
      {voiceError ? (
        <div className="mb-3 border border-red-900 bg-red-950/30 p-3 text-sm text-red-200" role="alert">
          {voiceError}
        </div>
      ) : null}

      <section aria-labelledby="quick-actions-title" className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="quick-actions-title" className="text-sm font-semibold text-slate-200">
              Quick starts
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Tap one, add your details, then send.
            </p>
          </div>
          <span className="nc-pill">10 home helpers</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {CHAT_QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => setInput(action.prompt)}
              className="rounded-xl border border-slate-700 bg-slate-800/60 p-3 text-left transition hover:border-[#d8b75d]/60 hover:bg-slate-700/60 focus:outline-none focus:ring-2 focus:ring-[#d8b75d]/30"
            >
              <span className="block text-sm font-semibold text-slate-100">{action.label}</span>
              <span className="mt-1 block text-xs leading-5 text-slate-400">{action.helper}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="mb-4 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/60 p-3 pr-2" data-testid="chat-messages">
        {loadingHistory && (
          <p className="text-sm text-slate-500">Loading conversation history...</p>
        )}
        {!loadingHistory && messages.length === 0 && (
          <p className="text-sm text-slate-500">Start typing below, or pick a quick start.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start items-end gap-1"}>
            <div className={
              "max-w-[82%] whitespace-pre-wrap border px-4 py-2 text-sm " +
              (m.role === "user"
                ? "rounded-2xl border-[#d8b75d]/40 bg-[#d8b75d] text-slate-950"
                : "rounded-2xl border-slate-700 bg-slate-800 text-slate-200")
            }>
              {m.content}
              {m.surface ? (
                <div className="mt-1 text-[10px] opacity-70">
                  from {m.surface === "whatsapp" ? "WhatsApp" : "Dashboard"}
                </div>
              ) : null}
            </div>
            {/* Manual Read-aloud button on assistant bubbles. The streaming
                TTS path can be silently blocked by Chrome's autoplay policy
                after a long async wait, even with our send-time primer.
                This button is a guaranteed user gesture → always speaks. */}
            {m.role === "assistant" && m.content && (
              <button
                type="button"
                onClick={() => {
                  if (typeof window === "undefined" || !window.speechSynthesis) return;
                  window.speechSynthesis.cancel();
                  speak(m.content);
                }}
                aria-label="Read aloud"
                title="Read aloud"
                className="flex h-8 w-8 shrink-0 items-center justify-center border border-slate-700 bg-slate-950 text-xs text-slate-400 transition hover:border-cyan-500 hover:text-slate-100"
              >
                R
              </button>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-500">Thinking...</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="flex gap-2 border-t border-slate-800 pt-4"
      >
        {voiceSupported && (
          <button
            type="button"
            onClick={toggleVoice}
            disabled={busy}
            aria-label={recording ? "Stop recording" : "Start voice input"}
            className={
              "nc-button px-4 py-2 text-sm disabled:opacity-50 " +
              (recording
                ? "animate-pulse border-red-500 bg-red-500 text-white hover:bg-red-400"
                : "")
            }
          >
            {recording ? "Stop" : "Mic"}
          </button>
        )}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={recording ? "Listening..." : "Type a message..."}
          className="nc-input min-h-11 flex-1"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="nc-button-primary px-5 py-2 text-sm"
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
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  start(): void;
  stop(): void;
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<{ [index: number]: { transcript: string } }>;
}
interface SpeechRecognitionErrorEventLike {
  error?: string;
}
