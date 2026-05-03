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
  // Voice OUT (text-to-speech) state — uses native browser Web Speech API,
  // zero latency, zero API key. iOS Apple voices are best; desktop Chrome
  // gets ~200 Google voices; Firefox uses OS voices.
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceOut, setVoiceOut] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [showVoicePicker, setShowVoicePicker] = useState(false);
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
  }, []);

  /** Queue an utterance. Does NOT cancel in-progress utterances —
   *  callers responsible for cancelling at start of new reply (so streamed
   *  sentences can queue up naturally without each one cutting off the prior). */
  function speak(text: string) {
    if (!voiceOut || typeof window === "undefined" || !window.speechSynthesis) {
      console.log("[tts] skipped: voiceOut=" + voiceOut + " supported=" + !!window?.speechSynthesis);
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
    u.onerror = (e) => console.warn("[tts] error", e);
    u.onstart = () => console.log("[tts] speaking:", clean.slice(0, 60));
    console.log("[tts] queue:", clean.slice(0, 60), "voice=" + (u.voice?.name || "default"));
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
      try {
        r.stop();
      } catch {
        setRecording(false);
      }
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
    } catch (primerErr) {
      console.warn("[tts] primer failed (non-fatal):", primerErr);
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
      console.log("[chat] stream response status:", r.status, "ok:", r.ok);
      if (!r.ok) throw new Error("HTTP " + r.status);
      if (!r.body) throw new Error("No response body");
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let eventCount = 0;
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
          try { event = JSON.parse(line); } catch (parseErr) {
            console.warn("[chat] skipped unparseable line:", line.slice(0, 100), parseErr);
            continue;
          }
          eventCount++;
          console.log("[chat] event:", event.type, eventCount);
          if (event.type === "text" && typeof event.delta === "string") {
            finalText += event.delta;
            setAssistantContent(finalText);
            handleSpeakBoundary();
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
            setAssistantContent("Error: " + event.message);
          }
          // tool / tool_result events ignored visually for now (could show indicator later)
        }
      }
      console.log("[chat] stream done. finalText length:", finalText.length, "events:", eventCount);

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
        } catch (fbErr) {
          setAssistantContent(
            "No reply — stream produced no text and fallback failed: " +
              (fbErr instanceof Error ? fbErr.message : String(fbErr)),
          );
        }
      }
    } catch (e) {
      console.error("[chat] stream error:", e);
      setAssistantContent("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold">Chat with NitsyClaw</h2>
        {voices.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleVoiceOut}
              aria-label={voiceOut ? "Mute voice output" : "Unmute voice output"}
              className={
                "rounded-xl px-3 py-1.5 text-xs transition " +
                (voiceOut
                  ? "bg-blue-600 hover:bg-blue-500 text-white"
                  : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300")
              }
            >
              {voiceOut ? "🔊 On" : "🔇 Off"}
            </button>
            <button
              type="button"
              onClick={() => setShowVoicePicker((v) => !v)}
              className="rounded-xl px-3 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
            >
              Voice
            </button>
          </div>
        )}
      </div>
      {showVoicePicker && voices.length > 0 && (
        <div className="mb-4 max-h-64 overflow-auto rounded-xl border border-neutral-800 bg-neutral-950 p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
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
                    ? "border-blue-500 bg-blue-950/40"
                    : "border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900")
                }
              >
                <div className="font-medium text-neutral-100">{v.name}</div>
                <div className="text-[10px] text-neutral-500">{v.lang} {v.localService ? "• system" : "• remote"}</div>
              </button>
            ))}
        </div>
      )}
      <p className="text-xs text-neutral-500 mb-4">
        Same brain as WhatsApp. Voice in (mic) + voice out (Web Speech). Conversations and Memory persisted.
      </p>

      <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-4" data-testid="chat-messages">
        {loadingHistory && (
          <p className="text-sm text-neutral-500">Loading conversation history...</p>
        )}
        {!loadingHistory && messages.length === 0 && (
          <p className="text-sm text-neutral-500">Start typing below. Try: <code>what's on my plate today</code></p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start items-end gap-1"}>
            <div className={
              "rounded-2xl px-4 py-2 max-w-[75%] whitespace-pre-wrap text-sm " +
              (m.role === "user"
                ? "bg-blue-600 text-white"
                : "bg-neutral-800 text-neutral-100")
            }>
              {m.content}
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
                className="rounded-full w-7 h-7 flex items-center justify-center text-xs bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-neutral-100 transition shrink-0"
              >
                🔊
              </button>
            )}
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
