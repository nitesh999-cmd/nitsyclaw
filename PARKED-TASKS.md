# NitsyClaw — Parked Tasks Playbook

**For Nitesh. Self-contained. Pick up any task at any time.**

Save this file at `C:\Users\Nitesh\projects\NitsyClaw\PARKED-TASKS.md` so it's always at hand.

---

## Order of priority (pick what fits your time)

| # | Task | Time | Cost | Status |
|---|------|------|------|--------|
| 0 | Self-chat bug fix | 5 min | free | ⚠️ DO FIRST — bot spamming contacts |
| 1 | Voice in (Web Speech, free) | 15 min | free | High value, no signup |
| 2 | Voice out + persona switcher | 30 min | free | Adds wow factor |
| 3 | UI glow-up (all 7 pages) | 90 min | free | Show-off feature |
| 4 | Microsoft 365 Wattage | 60 min | free | Requires Azure setup |
| 5 | Solar Harbour Gmail Workspace | 10 min | free | Quick |
| 6 | Yahoo Mail | 20 min | free | IMAP setup |
| 7 | Aggregate all into morning brief | 20 min | free | The payoff |
| 8 | Telegram bot | 45 min | free | Bonus channel |

Total: ~5 hours of focused work. Can be done in 30-min chunks.

---

## Task 0 — URGENT: Self-chat bug fix (5 min)

**Problem:** NitsyClaw replies in every WhatsApp chat, not just your self-chat. Spamming contacts.

**Fix:**

1. Open `apps/bot/src/wwebjs-client.ts`
2. Find the `handleMessage` function, look for these two lines:
   ```ts
   const fromRaw = (m as any).from ?? "";
   const from = fromRaw.replace(/@c\.us$/, "");
   ```
3. Add right after them:
   ```ts
   const toRaw = (m as any).to ?? "";
   const to = toRaw.replace(/@c\.us$/, "");
   const isSelfChat = (from === this.opts.ownerNumber && to === this.opts.ownerNumber);
   if (!isSelfChat) {
     console.log(`[wwebjs] dropped: not self-chat (from=${from} to=${to})`);
     return;
   }
   ```
4. Save. Bot auto-reloads in 5 sec.

**Test:** Send to a friend → no reply. Send to yourself → reply.

**Damage check:** Open WhatsApp, scroll your chats. If NitsyClaw replied to anyone, send them this:
> Sorry — testing an AI assistant for personal use, accidentally got cross-wired into our chat. Ignore those weird messages, they were the bot not me. Fixed now.

---

## Task 1 — Voice in (15 min, free)

**What it adds:** Tap mic in dashboard /chat, speak, see transcript, send.

**What to do:**

1. Open `apps/dashboard/src/app/chat/page.tsx`
2. Replace the existing form section (look for `<form onSubmit={...}>`) with this enhanced version:

```tsx
// At the top, add to imports:
import { useState, useRef, useEffect } from "react";

// Inside ChatPage component, add these states near the top:
const [recording, setRecording] = useState(false);
const recognitionRef = useRef<any>(null);

// Add this useEffect to set up speech recognition:
useEffect(() => {
  if (typeof window === "undefined") return;
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return;
  const r = new SR();
  r.continuous = false;
  r.interimResults = true;
  r.lang = "en-AU";
  r.onresult = (e: any) => {
    const t = Array.from(e.results).map((res: any) => res[0].transcript).join("");
    setInput(t);
  };
  r.onend = () => setRecording(false);
  recognitionRef.current = r;
}, []);

// Add a toggle function:
function toggleVoice() {
  if (!recognitionRef.current) {
    alert("Speech recognition not supported in this browser. Try Chrome or Safari.");
    return;
  }
  if (recording) {
    recognitionRef.current.stop();
  } else {
    setInput("");
    recognitionRef.current.start();
    setRecording(true);
  }
}

// In your form, before the input, add a mic button:
<button
  type="button"
  onClick={toggleVoice}
  className={
    "rounded-xl px-4 py-2 text-sm transition " +
    (recording
      ? "bg-red-600 hover:bg-red-500 text-white animate-pulse"
      : "bg-neutral-800 hover:bg-neutral-700 text-neutral-200")
  }
  aria-label={recording ? "Stop recording" : "Start voice input"}
>
  {recording ? "● Stop" : "🎤"}
</button>
```

3. Save. Vercel auto-deploys in ~30 sec.

**Test:** Open dashboard `/chat` on phone, tap mic, speak, words appear in input box. Tap send.

**Browser support:** Works on Chrome (PC + Android), Safari (iOS 14.5+). Not Firefox.

---

## Task 2 — Voice out + persona switcher (30 min, free)

**What it adds:** NitsyClaw replies are read aloud. Settings page lets you pick voice.

**Step 1 — Voice out in chat:**

In `apps/dashboard/src/app/chat/page.tsx`, after the API call returns the reply, add:

```tsx
// After: setMessages((cur) => [...cur, { role: "assistant", content: data.reply ?? "(no reply)" }]);
// Add:
if (typeof window !== "undefined" && data.reply) {
  const u = new SpeechSynthesisUtterance(data.reply);
  // Voice from localStorage if user picked one in Settings, else default
  const savedVoice = localStorage.getItem("nitsyclaw-voice");
  if (savedVoice) {
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find((v) => v.name === savedVoice);
    if (match) u.voice = match;
  }
  u.rate = 1.0;
  u.pitch = 1.0;
  window.speechSynthesis.speak(u);
}
```

**Step 2 — Persona switcher in Settings:**

Edit `apps/dashboard/src/app/settings/page.tsx`. Add a new section:

```tsx
"use client";
// Add this import at top
import { useState, useEffect } from "react";

// Inside the component, add:
const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
const [selectedVoice, setSelectedVoice] = useState<string>("");

useEffect(() => {
  if (typeof window === "undefined") return;
  const update = () => setVoices(window.speechSynthesis.getVoices());
  update();
  window.speechSynthesis.onvoiceschanged = update;
  setSelectedVoice(localStorage.getItem("nitsyclaw-voice") || "");
}, []);

function pick(name: string) {
  setSelectedVoice(name);
  localStorage.setItem("nitsyclaw-voice", name);
  // Preview
  const v = voices.find((x) => x.name === name);
  if (v) {
    const u = new SpeechSynthesisUtterance("Hi, I'm NitsyClaw. This is how I sound.");
    u.voice = v;
    window.speechSynthesis.speak(u);
  }
}

// In your JSX, add a new section:
<section data-testid="settings-voice">
  <h3 className="text-sm uppercase tracking-wide text-neutral-400 mb-2">Voice</h3>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-96 overflow-auto">
    {voices.map((v) => (
      <button
        key={v.name}
        onClick={() => pick(v.name)}
        className={
          "text-left text-sm rounded-xl px-4 py-3 border transition " +
          (selectedVoice === v.name
            ? "border-blue-500 bg-blue-950/30"
            : "border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900")
        }
      >
        <div className="font-medium">{v.name}</div>
        <div className="text-xs text-neutral-500">{v.lang} · {v.localService ? "system" : "remote"}</div>
      </button>
    ))}
  </div>
  {voices.length === 0 && <p className="text-sm text-neutral-500">Loading voices…</p>}
</section>
```

3. Save. Vercel auto-deploys.

**Test:** Settings page → tap a voice card → hear preview. Then chat → NitsyClaw replies in that voice.

**Voices available depend on device:**
- iOS: 15+ Apple voices including Siri (best quality)
- Android: 10+ Google TTS voices
- Desktop Chrome: 200+ Google Cloud voices (good)

---

## Task 3 — UI glow-up (90 min, free)

This is the big one. Skipping detailed code here because it's a full redesign. **When you have a clean 90 min, message me with "do the UI glow-up"** and I'll send a single PowerShell script that rewrites all 7 pages with shadcn v4 + Cult UI patterns + violet/blue gradient accents + mobile-first layout.

What changes:
- New design system: Geist Sans font, violet→blue accent, slate-950 dark, 8px radius
- Mobile bottom tab bar instead of side rail
- Glass-frosted cards on Today
- Streaming text animation in chat
- PWA manifest so "Add to Home Screen" feels like a real app
- Splash screen + icon

---

## Task 4 — Microsoft 365 Wattage (60 min, free, requires admin)

You started this. Resume here.

### A. Azure App Registration (10 min)

1. https://portal.azure.com → sign in with Wattage admin
2. Search "App registrations" → click → **+ New registration**
3. Name: `NitsyClaw`
4. Supported account types: **Multitenant + personal Microsoft accounts**
5. Redirect URI: **Public client/native** + `http://localhost`
6. Register
7. From Overview page, save:
   - **Application (client) ID**
   - **Directory (tenant) ID**
8. Left sidebar → **API permissions** → **+ Add a permission** → **Microsoft Graph** → **Delegated**
9. Tick: `Mail.Read`, `Mail.ReadWrite`, `Calendars.Read`, `Calendars.ReadWrite`, `User.Read`, `offline_access`
10. **Grant admin consent for Wattage** → Yes
11. Left sidebar → **Authentication** → scroll to Advanced → toggle **Allow public client flows** = Yes → Save

### B. Code (30 min) — message me with **"wire M365"** and your Client ID + Tenant ID

I'll send:
- `microsoft-auth.ts` (device-code OAuth flow — no redirect URL hassle)
- `microsoft-graph.ts` (email + calendar read)
- New env vars: `MS_CLIENT_ID`, `MS_TENANT_ID`, `MS_TOKEN_JSON`
- First-time auth script: `pnpm ms:auth`

### C. Wire into brief (10 min) — automatic after step B

The morning brief will pull Outlook events alongside Google events automatically.

---

## Task 5 — Solar Harbour Gmail Workspace (10 min)

Workspace email uses the same Google OAuth flow as personal Gmail. Just add a 2nd account.

1. Run: `pnpm google:auth` (new flow — supports multi-account)
2. Browser opens, sign in with `nitesh@solarharbour.com.au`
3. Approve permissions
4. Token saved as `google-token-2.json`
5. Brief auto-merges events + emails from both accounts

**For this to work, message me with "multi-Gmail support"** — I need to update `google-auth.ts` to handle multiple tokens.

---

## Task 6 — Yahoo Mail (20 min)

Yahoo doesn't support OAuth for 3rd-party apps reliably. Use App Password + IMAP.

1. https://login.yahoo.com/account/security
2. Sign in with Yahoo email
3. Find **Generate app password**
4. Name it `nitsyclaw`
5. Copy the 16-char password

Then message me with **"wire Yahoo"** + the email address. I'll send:
- IMAP fetcher using `imapflow` library
- Env vars: `YAHOO_EMAIL`, `YAHOO_APP_PASSWORD`
- Auto-merge into brief

---

## Task 7 — Aggregate everything into morning brief (20 min)

Once Tasks 4–6 are done, message me with **"merge all email/cal sources into brief"** and I'll send:

- Update `04-morning-brief.ts` to pull from:
  - Google Calendar (personal + Solar Harbour)
  - Outlook Calendar (Wattage)
  - Gmail unread (personal + Solar Harbour)
  - Outlook unread (Wattage)
  - Yahoo unread

- Brief format:
  ```
  Good morning. Brief for 2026-04-26:

  📅 Calendar (5 events):
    • 09:00 — Standup [Wattage]
    • 14:00 — Call with Priya [Personal]
  
  📧 Top unread (12 across 5 accounts):
    1. [SolarHarbour] Customer escalation — sarah@…
    2. [Personal] Bank statement
    ...
  
  ⏰ Reminders today:
    • Drink water at 11am
  ```

---

## Task 8 — Telegram bot (45 min, optional bonus)

Backup channel. Useful if WhatsApp ever breaks.

1. https://t.me/BotFather on Telegram
2. `/newbot` → name `NitsyClaw` → username `nitsyclaw_bot` (or similar)
3. Save the token BotFather gives you

Then message me with **"add Telegram"** + the token. I'll send:
- New `TelegramClient` adapter implementing the same `WhatsAppClient` interface
- Same agent loop, same DB, same memory
- You can text NitsyClaw on Telegram OR WhatsApp interchangeably

---

## How to use this playbook

1. **Right now:** do Task 0 (5 min) to stop the spam bug
2. **Tonight or tomorrow:** pick one task that fits your time
3. **Message me with the task name** when you want to do it
4. I'll send self-contained code/instructions
5. Mark it done in your head and move on

You don't owe yourself doing all of these. Pick what brings real value.

---

## Quick references

- Project root: `C:\Users\Nitesh\projects\NitsyClaw\`
- Local URLs: dashboard at `http://localhost:3000`, bot logs in PowerShell window
- Live URL: https://nitsyclaw.vercel.app
- GitHub: https://github.com/nitesh999-cmd/nitsyclaw
- Deploy: `git push` → Vercel auto-deploys ~30 sec
- Restart everything: `powershell -ExecutionPolicy Bypass -File C:\Users\Nitesh\projects\NitsyClaw\nuke-and-go.ps1`

---

## When something breaks

1. Run `nuke-and-go.ps1` (restarts everything cleanly)
2. Check `watchdog.log` in project folder
3. If still broken, message me with the error
