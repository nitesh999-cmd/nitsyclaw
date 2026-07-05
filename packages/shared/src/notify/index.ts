// Push-notification helper. Best-effort; never throws.
//
// PRIMARY: ntfy.sh (free, no signup, cross-device).
//   Set NTFY_TOPIC in .env.local to a unique random string (e.g. nitsyclaw-x7k2p9).
//   Subscribe on phone via free ntfy app (iOS/Android) → "Add subscription" → enter topic.
//   Subscribe on PC via https://ntfy.sh/<topic> in browser, or ntfy desktop app.
//   ANYONE who knows the topic name can publish/subscribe — pick something
//   non-guessable. There is no auth on the free tier.
//
// EMAIL: ntfy.sh email forwarding (free tier, ~16/day/IP).
//   Set NOTIFY_EMAIL in .env.local to e.g. nitesh999@gmail.com.
//   Each ntfy POST also asks ntfy to forward as email to that address.
//   Lands in inbox → Outlook PC app's normal new-mail notification fires.
//   If you hit the daily limit, the email silently drops (push still works).
//
// SECONDARY (Windows local only): native toast via PowerShell.
//   Set WINDOWS_TOAST=true in .env.local. Pops a notification on the laptop.
//   Useful when you're at the desk but not in WhatsApp Web.
//
// All channels are independent. If no env is set, this is a no-op.

export interface NotifyOpts {
  title?: string;
  priority?: "min" | "low" | "default" | "high" | "urgent";
  tags?: string[];
  /** Click-target URL for ntfy notifications (e.g. WhatsApp deep link, dashboard URL) */
  click?: string;
}

/** Per-channel outcome: "sent" delivered, "failed" attempted and errored, "skipped" not configured for this env. */
export type NotifyChannelResult = "sent" | "failed" | "skipped";

export interface PushNotifyResult {
  ntfy: NotifyChannelResult;
  toast: NotifyChannelResult;
}

export async function pushNotify(text: string, opts: NotifyOpts = {}): Promise<PushNotifyResult> {
  const [ntfy, toast] = await Promise.all([sendNtfy(text, opts), sendWindowsToast(text, opts)]);
  return { ntfy, toast };
}

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?:\+?\d[\s().-]?){8,}\d/g;
const TOKEN_RE = /\b(?:(?:sk|pk)_(?:live|test)_[A-Za-z0-9._-]{8,}|(?:sk|pk|ghp|xox[baprs]?|ya29|eyJ)[A-Za-z0-9._-]{12,})\b/g;

export function formatNotifyFailure(channel: "ntfy" | "toast", error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const redacted = text
    .replace(EMAIL_RE, "[redacted:email]")
    .replace(TOKEN_RE, "[redacted:token]")
    .replace(PHONE_RE, "[redacted:phone]");
  return `[notify/${channel}] failed ${redacted.slice(0, 160)}`.trim();
}

// fetch()'s Headers implementation throws a TypeError on CR/LF or non-Latin1
// codepoints in a header value (ntfy Title/Tags are user/LLM-composed text,
// e.g. an email subject with an emoji or embedded newline) — that throw
// happens synchronously inside sendNtfy's try block before the request is
// ever sent, so an unsanitized header silently drops the whole push with no
// visible error beyond the caught+logged exception. Strip CR/LF and encode
// non-ASCII so the header is always a valid HTTP field-value.
function sanitizeHeaderValue(value: string): string {
  const stripped = value.replace(/[\r\n]+/g, " ").trim();
  // eslint-disable-next-line no-control-regex
  const asciiOnly = stripped.replace(/[^\x20-\x7e]/g, "");
  return asciiOnly.slice(0, 200) || "-";
}

async function sendNtfy(text: string, opts: NotifyOpts): Promise<NotifyChannelResult> {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return "skipped";
  try {
    const headers: Record<string, string> = {
      Title: sanitizeHeaderValue(opts.title ?? "NitsyClaw"),
      Priority: opts.priority ?? "default",
      Tags: sanitizeHeaderValue((opts.tags ?? ["robot"]).join(",")),
    };
    if (opts.click) headers.Click = sanitizeHeaderValue(opts.click);
    // Note: ntfy.sh email forwarding (Email header) was tested and rejected
    // by the free tier with HTTP 400 "anonymous email sending is not allowed".
    // To re-enable: get an ntfy paid account, add NTFY_AUTH_TOKEN env, send
    // Authorization: Bearer ${NTFY_AUTH_TOKEN} + Email: NOTIFY_EMAIL headers.
    // For now, email channel goes via direct SMTP / Graph (see TODO in
    // CLAUDE-CODE-BACKLOG.md). Push channels: ntfy app + Windows toast.
    const response = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: "POST",
      headers,
      body: text.slice(0, 4096),
    });
    if (!response.ok) {
      console.error(
        formatNotifyFailure("ntfy", `status=${response.status} ${response.statusText}`),
      );
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error(formatNotifyFailure("ntfy", e));
    return "failed";
  }
}

async function sendWindowsToast(text: string, opts: NotifyOpts): Promise<NotifyChannelResult> {
  if (process.env.WINDOWS_TOAST !== "true") return "skipped";
  if (process.platform !== "win32") return "skipped";
  try {
    const { spawn } = await import("node:child_process");
    const title = (opts.title ?? "NitsyClaw").replace(/'/g, "''");
    const body = text.slice(0, 200).replace(/'/g, "''");
    // Two PowerShell-7-compatibility fixes vs the original:
    //   1. @() array cast around GetElementsByTagName('text') to force eager
    //      enumeration before indexing (PS7 returned a lazy iterator that
    //      threw "Collection was modified" when indexed).
    //   2. AppID 'Microsoft.Windows.Computer' is a registered system AppID,
    //      so toasts actually surface in Action Center on Win10/11. Custom
    //      AppIDs require Start Menu shortcut registration which we skip.
    const ps = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType=WindowsRuntime] | Out-Null
$tpl = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$texts = @($tpl.GetElementsByTagName('text'))
$texts[0].AppendChild($tpl.CreateTextNode('${title}')) | Out-Null
$texts[1].AppendChild($tpl.CreateTextNode('${body}')) | Out-Null
$toast = [Windows.UI.Notifications.ToastNotification]::new($tpl)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Microsoft.Windows.Computer').Show($toast)
`.trim();
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", ps], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", (e) => {
      console.error(formatNotifyFailure("toast", e));
    });
    child.unref();
    return "sent";
  } catch (e) {
    console.error(formatNotifyFailure("toast", e));
    return "failed";
  }
}
