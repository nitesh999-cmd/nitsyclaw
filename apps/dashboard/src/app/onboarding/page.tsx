import Link from "next/link";
import { getConnectedAccount, getDb, memories, reminders, confirmations } from "@nitsyclaw/shared/db";
import { getOwnerIdentity } from "../../lib/dashboard-runtime";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type ChecklistItem = {
  label: string;
  done: boolean;
  detail: string;
  href: string;
  group: "ready" | "setup" | "safety";
};

const firstTasks = [
  {
    title: "Remember something important",
    example: "remember my passport is in the black folder",
    href: "/chat",
  },
  {
    title: "Set a reminder",
    example: "remind me to call Mukesh tomorrow at 10 am",
    href: "/chat",
  },
  {
    title: "Log spending",
    example: "I spent $18.40 at Chemist Warehouse for medicine",
    href: "/chat",
  },
  {
    title: "Check a message",
    example: "check before send: I am angry about this bill",
    href: "/chat",
  },
];

const plainChoices = [
  {
    label: "Ask",
    title: "Ask a normal question",
    detail: "Use plain words or a voice note. Replies stay short and in English.",
    href: "/chat",
  },
  {
    label: "Remember",
    title: "Save life details",
    detail: "Store useful notes like locations, account reminders, and personal preferences.",
    href: "/memory",
  },
  {
    label: "Review",
    title: "Approve risky actions",
    detail: "Anything that sends, books, deletes, or changes outside data waits here first.",
    href: "/confirmations",
  },
];

async function loadChecklist(): Promise<ChecklistItem[]> {
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
    const owner = checks.whatsappOwner ? getOwnerIdentity() : null;
    const [spotify, memoryRows, reminderRows, confirmationRows] = await Promise.all([
      owner ? getConnectedAccount(db, { provider: "spotify", ownerHash: owner.ownerHash }).catch(() => null) : null,
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
      label: "Core app is connected",
      done: checks.database,
      detail: "Memory, messages, reminders, expenses, and requests can be saved.",
      href: "/health",
      group: "setup",
    },
    {
      label: "Assistant brain is ready",
      done: checks.anthropic && checks.openai,
      detail: "AI keys are configured for normal replies, voice, and search support.",
      href: "/integrations",
      group: "setup",
    },
    {
      label: "Private WhatsApp owner is set",
      done: checks.whatsappOwner,
      detail: "Messages are routed to the owner instead of acting like a public bot.",
      href: "/integrations",
      group: "setup",
    },
    {
      label: "First reminder saved",
      done: checks.firstReminder,
      detail: 'Try: "remind me to call Mukesh tomorrow at 10 am".',
      href: "/chat",
      group: "ready",
    },
    {
      label: "First memory saved",
      done: checks.firstMemory,
      detail: 'Try: "remember my passport is in the black folder".',
      href: "/chat",
      group: "ready",
    },
    {
      label: "Music account connected",
      done: checks.spotify,
      detail: "Optional. Enables confirmed private playlists after Spotify setup.",
      href: "/integrations",
      group: "setup",
    },
    {
      label: "No action waiting for approval",
      done: checks.pendingConfirmations === 0,
      detail: checks.pendingConfirmations
        ? `${checks.pendingConfirmations} action needs review before anything external changes.`
        : "Risky actions are clear. New approvals will appear before anything important happens.",
      href: "/confirmations",
      group: "safety",
    },
  ];
}

function progressText(doneCount: number, total: number) {
  if (doneCount === total) return `All ${total} setup checks complete.`;
  return `${doneCount} of ${total} setup checks complete.`;
}

export default async function OnboardingPage() {
  const checklist = await loadChecklist();
  const doneCount = checklist.filter((item) => item.done).length;
  const grouped = {
    ready: checklist.filter((item) => item.group === "ready"),
    setup: checklist.filter((item) => item.group === "setup"),
    safety: checklist.filter((item) => item.group === "safety"),
  };

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Start here</div>
        <h2 className="mt-2 text-3xl font-semibold">Your personal PA, in plain words</h2>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">
          NitsyClaw is for everyday life admin. Ask normally, send a voice note, save a reminder, log spending, or draft a message. If something could affect the outside world, it asks first.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/chat" className="nc-button-primary">Try first task</Link>
          <Link href="/confirmations" className="nc-button">Review approvals</Link>
          <Link href="/privacy-center" className="nc-button">Check privacy</Link>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {plainChoices.map((choice) => (
          <Link key={choice.label} href={choice.href} className="nc-tile hover:border-[#d8b75d]/40 transition-colors">
            <div className="nc-eyebrow">{choice.label}</div>
            <h3 className="mt-2 text-lg font-semibold text-slate-100">{choice.title}</h3>
            <p className="mt-2 text-sm text-slate-400">{choice.detail}</p>
          </Link>
        ))}
      </section>

      <section className="nc-section">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="nc-eyebrow">First useful tasks</div>
            <h3 className="mt-2 text-xl font-semibold text-slate-100">Start with one of these</h3>
          </div>
          <p className="text-sm text-slate-400">No AI knowledge needed. Copy one sentence into chat or WhatsApp.</p>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {firstTasks.map((task, index) => (
            <Link key={task.title} href={task.href} className="rounded border border-slate-800 bg-slate-950/40 p-3 hover:border-[#d8b75d]/40">
              <div className="text-xs font-semibold text-[#d8b75d]">Task {index + 1}</div>
              <div className="mt-1 text-sm font-medium text-slate-100">{task.title}</div>
              <div className="mt-1 text-sm text-slate-400">{task.example}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="nc-section">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="nc-eyebrow">Setup progress</div>
            <h3 className="mt-2 text-xl font-semibold text-slate-100">{progressText(doneCount, checklist.length)}</h3>
          </div>
          <Link className="text-sm text-[#d8b75d] hover:text-[#f1d58a]" href="/integrations">
            Manage connections
          </Link>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <ChecklistGroup title="Works now" items={grouped.ready} />
          <ChecklistGroup title="Needs setup" items={grouped.setup} />
          <ChecklistGroup title="Safety" items={grouped.safety} />
        </div>
      </section>
    </div>
  );
}

function ChecklistGroup({ title, items }: { title: string; items: ChecklistItem[] }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/30">
      <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">{title}</div>
      <div className="divide-y divide-slate-800">
        {items.map((item) => (
          <div key={item.label} className="grid grid-cols-[28px_1fr_auto] gap-3 p-4">
            <div className={`text-sm font-semibold ${item.done ? "text-emerald-400" : "text-slate-600"}`}>
              {item.done ? "✓" : "○"}
            </div>
            <div>
              <div className={`font-medium ${item.done ? "text-slate-200" : "text-slate-400"}`}>{item.label}</div>
              <div className="mt-1 text-sm text-slate-500">{item.detail}</div>
            </div>
            <Link className="whitespace-nowrap text-sm text-[#d8b75d] hover:text-[#f1d58a]" href={item.href}>
              Open
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
