import { google } from "googleapis";
import { listGoogleAccounts, loadOAuthClient } from "../apps/bot/src/google-auth";
import { getMsAccessToken, hasMsToken } from "../apps/bot/src/microsoft-auth";

type ProofStatus = "pass" | "fail" | "skip";

interface ProofLine {
  provider: string;
  check: string;
  status: ProofStatus;
  detail: string;
}

const GOOGLE_CALENDAR_WINDOW_DAYS = 7;

async function main(): Promise<void> {
  const lines: ProofLine[] = [];
  lines.push(...await proveGoogleReadOnly());
  lines.push(...await proveMicrosoftReadOnly());

  console.log("Provider read-only proof");
  console.log("No subjects, senders, snippets, event titles, message bodies, tokens, or secret values are printed.");
  for (const line of lines) {
    console.log(`- ${line.provider} ${line.check}: ${line.status} - ${line.detail}`);
  }

  const failed = lines.some((line) => line.status === "fail");
  if (failed) process.exitCode = 1;
}

async function proveGoogleReadOnly(): Promise<ProofLine[]> {
  const accounts = listGoogleAccounts();
  if (!accounts.length) {
    return [
      {
        provider: "Google",
        check: "accounts",
        status: "skip",
        detail: "No Google account token detected.",
      },
    ];
  }

  const lines: ProofLine[] = [];
  for (const label of accounts) {
    try {
      const auth = loadOAuthClient(label);
      const gmail = google.gmail({ version: "v1", auth });
      await gmail.users.messages.list({
        userId: "me",
        q: "is:unread in:inbox",
        maxResults: 1,
        includeSpamTrash: false,
        fields: "messages/id,resultSizeEstimate",
      });
      lines.push({
        provider: `Gmail (${label})`,
        check: "read",
        status: "pass",
        detail: "Mailbox read endpoint responded.",
      });
    } catch (error) {
      lines.push({
        provider: `Gmail (${label})`,
        check: "read",
        status: "fail",
        detail: safeError(error),
      });
    }

    try {
      const auth = loadOAuthClient(label);
      const calendar = google.calendar({ version: "v3", auth });
      const now = new Date();
      const end = new Date(now.getTime() + GOOGLE_CALENDAR_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      await calendar.events.list({
        calendarId: "primary",
        timeMin: now.toISOString(),
        timeMax: end.toISOString(),
        maxResults: 1,
        singleEvents: true,
        orderBy: "startTime",
        fields: "items/id,nextPageToken",
      });
      lines.push({
        provider: `Google Calendar (${label})`,
        check: "read",
        status: "pass",
        detail: "Calendar read endpoint responded.",
      });
    } catch (error) {
      lines.push({
        provider: `Google Calendar (${label})`,
        check: "read",
        status: "fail",
        detail: safeError(error),
      });
    }
  }
  return lines;
}

async function proveMicrosoftReadOnly(): Promise<ProofLine[]> {
  if (!hasMsToken()) {
    return [
      {
        provider: "Microsoft",
        check: "account",
        status: "skip",
        detail: "No Microsoft account token detected.",
      },
    ];
  }

  let token: string;
  try {
    token = await getMsAccessToken();
  } catch (error) {
    return [
      {
        provider: "Microsoft",
        check: "token refresh",
        status: "fail",
        detail: safeError(error),
      },
    ];
  }

  const lines: ProofLine[] = [];
  lines.push(await proveMicrosoftEndpoint(
    token,
    "Outlook",
    "mail read",
    "/me/mailFolders/inbox/messages?$filter=isRead eq false&$top=1&$select=id",
  ));

  const now = new Date();
  const end = new Date(now.getTime() + GOOGLE_CALENDAR_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  lines.push(await proveMicrosoftEndpoint(
    token,
    "Outlook Calendar",
    "calendar read",
    `/me/calendarview?startDateTime=${encodeURIComponent(now.toISOString())}&endDateTime=${encodeURIComponent(end.toISOString())}&$top=1&$select=id`,
  ));
  return lines;
}

async function proveMicrosoftEndpoint(
  token: string,
  provider: string,
  check: string,
  path: string,
): Promise<ProofLine> {
  try {
    const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      return {
        provider,
        check,
        status: "fail",
        detail: `Endpoint returned HTTP ${response.status}.`,
      };
    }
    await response.arrayBuffer();
    return {
      provider,
      check,
      status: "pass",
      detail: "Read endpoint responded.",
    };
  } catch (error) {
    return {
      provider,
      check,
      status: "fail",
      detail: safeError(error),
    };
  }
}

function safeError(error: unknown): string {
  if (error instanceof Error) {
    const status = (error as Error & { code?: string | number; status?: string | number }).status ??
      (error as Error & { code?: string | number; status?: string | number }).code;
    const safeMessage = safeErrorMessage(error.message);
    if (status && safeMessage) return `Failed with ${String(status)}: ${safeMessage}.`;
    if (status) return `Failed with ${String(status)}.`;
    if (safeMessage) return safeMessage;
    return "Endpoint failed without a safe status code.";
  }
  return "Endpoint failed.";
}

function safeErrorMessage(message: string): string | null {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  if (lower.includes("invalid_grant")) return "auth token is invalid or expired";
  if (lower.includes("insufficient") && lower.includes("scope")) return "required read scope is missing";
  if (lower.includes("unauthorized") || lower.includes("401")) return "provider returned unauthorized";
  if (lower.includes("forbidden") || lower.includes("403")) return "provider returned forbidden";
  const refresh = normalized.match(/\b(?:MS refresh failed|refresh failed|Graph request failed|request failed):?\s*(\d{3})\b/i);
  if (refresh?.[1]) return `provider request failed with HTTP ${refresh[1]}`;
  return null;
}

main().catch((error) => {
  console.error(`Provider read-only proof failed: ${safeError(error)}`);
  process.exitCode = 1;
});
