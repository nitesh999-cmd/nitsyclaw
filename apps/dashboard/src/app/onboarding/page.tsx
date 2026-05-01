import Link from "next/link";
import { getConnectedAccount, getDb, memories, reminders, confirmations } from "@nitsyclaw/shared/db";
import { hashPhone } from "@nitsyclaw/shared/utils";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function loadChecklist() {
  const checks = {
    database: false,
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    whatsappOwner: Boolean(process.env.WHATSAPP_OWNER_NUMBER),
    spotify: false,
    firstMemory: false,
    firstReminder: false,
    pendingConfirmations: 0,
  };

  try {
    const db = getDb();
    checks.database = true;
    const ownerPhone = process.env.WHATSAPP_OWNER_NUMBER ?? "61430008008";
    const [spotify, memoryRows, reminderRows, confirmationRows] = await Promise.all([
      getConnectedAccount(db, { provider: "spotify", ownerHash: hashPhone(ownerPhone) }).catch(() => null),
      db.select().from(memories).limit(1),
      db.select().from(reminders).where(eq(reminders.status, "pending")).limit(1),
      db.select().from(confirmations).where(eq(confirmations.status, "pending")).limit(10),
    ]);
    checks.spotify = Boolean(spotify);
    checks.firstMemory = memoryRows.length > 0;
    checks.firstReminder = reminderRows.length > 0;
    checks.pendingConfirmations = confirmationRows.length;
  } catch {
    checks.database = false;
  }

  return [
    {
      label: "Database connected",
      done: checks.database,
      detail: "Core memory, messages, reminders, and feature queue are available.",
      href: "/health",
    },
    {
      label: "AI keys configured",
      done: checks.anthropic && checks.openai,
      detail: "Anthropic runs the assistant. OpenAI powers voice and embeddings.",
      href: "/integrations",
    },
    {
      label: "WhatsApp owner configured",
      done: checks.whatsappOwner,
      detail: "Owner-only routing keeps the assistant private.",
      href: "/integrations",
    },
    {
      label: "Create first reminder",
      done: checks.firstReminder,
      detail: 'Try in chat: "remind me to drink water tomorrow at 9am".',
      href: "/chat",
    },
    {
      label: "Save first memory",
      done: checks.firstMemory,
      detail: 'Try in chat: "remember my passport is in the black folder".',
      href: "/chat",
    },
    {
      label: "Connect Spotify",
      done: checks.spotify,
      detail: "Optional. Enables music taste and confirmed private playlists.",
      href: "/integrations",
    },
    {
      label: "Review safety model",
      done: checks.pendingConfirmations === 0,
      detail: checks.pendingConfirmations
        ? `${checks.pendingConfirmations} action needs review.`
        : "NitsyClaw asks before sending, deleting, scheduling, or changing important things.",
      href: "/confirmations",
    },
  ];
}

export default async function OnboardingPage() {
  const checklist = await loadChecklist();
  const doneCount = checklist.filter((item) => item.done).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Onboarding</h2>
        <p className="mt-2 text-sm text-neutral-400">
          {doneCount} of {checklist.length} setup steps are complete.
        </p>
      </div>

      <div className="divide-y divide-neutral-800 border-y border-neutral-800">
        {checklist.map((item) => (
          <div key={item.label} className="grid gap-3 py-4 md:grid-cols-[32px_1fr_auto] md:items-center">
            <div className={item.done ? "text-emerald-300" : "text-neutral-500"}>
              {item.done ? "OK" : "--"}
            </div>
            <div>
              <div className="font-medium">{item.label}</div>
              <div className="text-sm text-neutral-400">{item.detail}</div>
            </div>
            <Link className="text-sm text-sky-300 hover:text-sky-200" href={item.href}>
              Open
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
