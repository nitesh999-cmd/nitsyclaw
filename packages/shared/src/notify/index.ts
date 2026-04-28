// Push-notification helper. Best-effort; never throws.
//
// PRIMARY: ntfy.sh (free, no signup, cross-device).
//   Set NTFY_TOPIC in .env.local to a unique random string (e.g. nitsyclaw-x7k2p9).
//   Subscribe on phone via free ntfy app (iOS/Android) → "Add subscription" → enter topic.
//   Subscribe on PC via https://ntfy.sh/<topic> in browser, or ntfy desktop app.
//   ANYONE who knows the topic name can publish/subscribe — pick something
//   non-guessable. There is no auth on the free tier.
//
// SECONDARY (Windows local only): native toast via PowerShell.
//   Set WINDOWS_TOAST=true in .env.local. Pops a notification on the laptop.
//   Useful when you're at the desk but not in WhatsApp Web.
//
// Both are independent. If neither env is set, this is a no-op.

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
    // Uses Windows Runtime API via PowerShell. No third-party module needed.
    const ps = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType=WindowsRuntime] | Out-Null
$tpl = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$tpl.GetElementsByTagName('text')[0].AppendChild($tpl.CreateTextNode('${title}')) | Out-Null
$tpl.GetElementsByTagName('text')[1].AppendChild($tpl.CreateTextNode('${body}')) | Out-Null
$toast = [Windows.UI.Notifications.ToastNotification]::new($tpl)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('NitsyClaw').Show($toast)
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
