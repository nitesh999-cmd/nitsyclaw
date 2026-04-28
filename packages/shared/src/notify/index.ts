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

export async function pushNotify(text: string, opts: NotifyOpts = {}): Promise<void> {
  await Promise.all([sendNtfy(text, opts), sendWindowsToast(text, opts)]);
}

async function sendNtfy(text: string, opts: NotifyOpts): Promise<void> {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;
  try {
    const headers: Record<string, string> = {
      Title: opts.title ?? "NitsyClaw",
      Priority: opts.priority ?? "default",
      Tags: (opts.tags ?? ["robot"]).join(","),
    };
    if (opts.click) headers.Click = opts.click;
    // Note: ntfy.sh email forwarding (Email header) was tested and rejected
    // by the free tier with HTTP 400 "anonymous email sending is not allowed".
    // To re-enable: get an ntfy paid account, add NTFY_AUTH_TOKEN env, send
    // Authorization: Bearer ${NTFY_AUTH_TOKEN} + Email: NOTIFY_EMAIL headers.
    // For now, email channel goes via direct SMTP / Graph (see TODO in
    // CLAUDE-CODE-BACKLOG.md). Push channels: ntfy app + Windows toast.
    await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: "POST",
      headers,
      body: text.slice(0, 4096),
    });
  } catch (e) {
    console.error("[notify/ntfy] failed", e);
  }
}

async function sendWindowsToast(text: string, opts: NotifyOpts): Promise<void> {
  if (process.env.WINDOWS_TOAST !== "true") return;
  if (process.platform !== "win32") return;
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
    child.unref();
  } catch (e) {
    console.error("[notify/toast] failed", e);
  }
}
