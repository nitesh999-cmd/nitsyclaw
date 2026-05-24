import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getDb,
  memories,
  reminders,
  confirmations,
  listProfileContextForOwner,
  upsertProfileContext,
} from "@nitsyclaw/shared/db";
import { getOwnerIdentity, logDashboardError } from "../../lib/dashboard-runtime";
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
    title: "Bill or receipt summary",
    example: "bill summary: AGL bill $240 due 18 May",
    href: "/chat",
  },
  {
    title: "Due-date reminder",
    example: "remind me to pay the AGL bill on 17 May at 9 am",
    href: "/chat",
  },
  {
    title: "Log spending",
    example: "I spent $18.40 at Chemist Warehouse for medicine",
    href: "/chat",
  },
  {
    title: "Receipt from WhatsApp",
    example: "I spent $18.40 at Chemist Warehouse for medicine",
    href: "/chat",
  },
];

const plainChoices = [
  {
    label: "Bills",
    title: "Understand bills and due dates",
    detail: "Paste bill text or ask for a summary. Turn due dates into reminders.",
    href: "/chat",
  },
  {
    label: "Expenses",
    title: "Log spending in AUD",
    detail: "Capture receipts, merchant, category, date, and simple monthly totals.",
    href: "/expenses",
  },
  {
    label: "Review",
    title: "Approve risky actions",
    detail: "Anything that sends, books, deletes, or changes outside data waits here first.",
    href: "/confirmations",
  },
];

const firstDayKeys = [
  "home_location",
  "current_location",
  "timezone",
  "default_currency",
  "reply_language",
  "daily_routine",
  "important_people",
  "preferred_channels",
  "first_three_jobs",
];

type FirstDayProfile = {
  homeLocation?: string;
  currentLocation?: string;
  timezone?: string;
  defaultCurrency?: string;
  replyLanguage?: string;
  dailyRoutine?: string;
  importantPeople?: string;
  preferredChannels?: string;
  firstThreeJobs?: string;
};

type OnboardingSearchParams = {
  saved?: string;
  error?: string;
};

async function loadChecklist(): Promise<ChecklistItem[]> {
  const checks = {
    database: false,
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    whatsappOwner: Boolean(process.env.WHATSAPP_OWNER_NUMBER),
    firstMemory: false,
    firstReminder: false,
    pendingConfirmations: 0,
  };

  try {
    const db = getDb();
    checks.database = true;
    const [memoryRows, reminderRows, confirmationRows] = await Promise.all([
      db.select().from(memories).limit(1),
      db.select().from(reminders).where(eq(reminders.status, "pending")).limit(1),
      db.select().from(confirmations).where(eq(confirmations.status, "pending")).limit(10),
    ]);
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

async function loadFirstDayProfile(): Promise<FirstDayProfile> {
  try {
    const owner = getOwnerIdentity();
    const rows = await listProfileContextForOwner(getDb(), owner.ownerHash, 100);
    const byKey = new Map(rows.filter((row) => firstDayKeys.includes(row.key)).map((row) => [row.key, row.value]));

    return {
      homeLocation: readProfileText(byKey.get("home_location"), "location"),
      currentLocation: readProfileText(byKey.get("current_location"), "location"),
      timezone: readProfileText(byKey.get("timezone"), "value"),
      defaultCurrency: readProfileText(byKey.get("default_currency"), "value"),
      replyLanguage: readProfileText(byKey.get("reply_language"), "value"),
      dailyRoutine: readProfileText(byKey.get("daily_routine"), "value"),
      importantPeople: readProfileText(byKey.get("important_people"), "value"),
      preferredChannels: readProfileText(byKey.get("preferred_channels"), "value"),
      firstThreeJobs: readProfileText(byKey.get("first_three_jobs"), "value"),
    };
  } catch {
    return {};
  }
}

async function saveFirstDayWizard(formData: FormData) {
  "use server";

  let redirectTo = "/onboarding?saved=1";
  try {
    const owner = getOwnerIdentity();
    const db = getDb();
    const now = new Date().toISOString();
    const homeLocation = cleanText(formData.get("homeLocation"), 120);
    const currentLocation = cleanText(formData.get("currentLocation"), 120);
    const timezone = cleanText(formData.get("timezone"), 80) || "Australia/Melbourne";
    const defaultCurrency = cleanCurrency(formData.get("defaultCurrency"));
    const replyLanguage = cleanText(formData.get("replyLanguage"), 40) || "English";
    const dailyRoutine = cleanText(formData.get("dailyRoutine"), 600);
    const importantPeople = cleanText(formData.get("importantPeople"), 600);
    const preferredChannels = cleanText(formData.get("preferredChannels"), 300);
    const firstThreeJobs = cleanText(formData.get("firstThreeJobs"), 700);

    if (!homeLocation && !currentLocation && !dailyRoutine && !importantPeople && !firstThreeJobs) {
      redirectTo = "/onboarding?error=empty";
    } else {
      const rows = [
        homeLocation
          ? {
              key: "home_location",
              value: { location: homeLocation, setAt: now },
            }
          : null,
        currentLocation
          ? {
              key: "current_location",
              value: { location: currentLocation, setAt: now },
            }
          : null,
        {
          key: "timezone",
          value: { value: timezone, setAt: now },
        },
        {
          key: "default_currency",
          value: { value: defaultCurrency, setAt: now },
        },
        {
          key: "reply_language",
          value: { value: replyLanguage, setAt: now },
        },
        dailyRoutine
          ? {
              key: "daily_routine",
              value: { value: dailyRoutine, setAt: now },
            }
          : null,
        importantPeople
          ? {
              key: "important_people",
              value: { value: importantPeople, setAt: now },
            }
          : null,
        preferredChannels
          ? {
              key: "preferred_channels",
              value: { value: preferredChannels, setAt: now },
            }
          : null,
        firstThreeJobs
          ? {
              key: "first_three_jobs",
              value: { value: firstThreeJobs, jobs: splitLines(firstThreeJobs), setAt: now },
            }
          : null,
      ].filter(Boolean) as Array<{ key: string; value: Record<string, unknown> }>;

      await Promise.all(
        rows.map((row) =>
          upsertProfileContext(db, {
            ownerHash: owner.ownerHash,
            key: row.key,
            value: row.value,
            source: "dashboard:first-day-wizard",
            sensitivity: "personal",
          }),
        ),
      );
      revalidatePath("/onboarding");
      revalidatePath("/profile");
    }
  } catch (error) {
    logDashboardError("first-day-wizard", error);
    redirectTo = "/onboarding?error=save-failed";
  }

  redirect(redirectTo);
}

function progressText(doneCount: number, total: number) {
  if (doneCount === total) return `All ${total} setup checks complete.`;
  return `${doneCount} of ${total} setup checks complete.`;
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<OnboardingSearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const [checklist, firstDayProfile] = await Promise.all([loadChecklist(), loadFirstDayProfile()]);
  const doneCount = checklist.filter((item) => item.done).length;
  const grouped = {
    ready: checklist.filter((item) => item.group === "ready"),
    setup: checklist.filter((item) => item.group === "setup"),
    safety: checklist.filter((item) => item.group === "safety"),
  };

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Controlled validation build</div>
        <h2 className="mt-2 text-3xl font-semibold">Set up the validation demo</h2>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">
          Bills, receipts, expenses, and reminders first. Give NitsyClaw the few details a good personal assistant would ask on day one: where you are, how you like replies, and what due dates must not slip.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href="#first-day-wizard" className="nc-button-primary">Start first-day setup</a>
          <Link href="/confirmations" className="nc-button">Review approvals</Link>
          <Link href="/privacy-center" className="nc-button">Check privacy</Link>
        </div>
      </section>

      {params.saved ? (
        <div className="rounded border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-200" role="status">
          First-day setup saved. NitsyClaw can now use these details for safer, more useful answers.
        </div>
      ) : null}

      {params.error ? (
        <div className="rounded border border-red-900 bg-red-950/30 p-3 text-sm text-red-200" role="alert">
          {params.error === "empty"
            ? "Add at least one useful detail before saving."
            : "Could not save first-day setup. Check database and owner configuration, then try again."}
        </div>
      ) : null}

      <section id="first-day-wizard" className="nc-section">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="nc-eyebrow">Personal PA profile</div>
            <h3 className="mt-2 text-xl font-semibold text-slate-100">Answer once. Use everywhere.</h3>
          </div>
          <p className="max-w-xl text-sm text-slate-400">
            This saves profile context only. It does not connect Gmail, Outlook, Calendar, Spotify, Drive, Photos, SMS, bank feeds, birthdays, social video, or any outside account.
          </p>
        </div>

        <form action={saveFirstDayWizard} className="mt-5 grid gap-5">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-200">
              Home base
              <input
                name="homeLocation"
                className="nc-input"
                placeholder="Melbourne, Victoria, Australia"
                defaultValue={firstDayProfile.homeLocation ?? "Melbourne, Victoria, Australia"}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-200">
              Current or travel location
              <input
                name="currentLocation"
                className="nc-input"
                placeholder="Leave blank if same as home"
                defaultValue={firstDayProfile.currentLocation ?? ""}
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-2 text-sm font-medium text-slate-200">
              Timezone
              <input
                name="timezone"
                className="nc-input"
                placeholder="Australia/Melbourne"
                defaultValue={firstDayProfile.timezone ?? "Australia/Melbourne"}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-200">
              Default currency
              <input
                name="defaultCurrency"
                className="nc-input"
                placeholder="AUD"
                defaultValue={firstDayProfile.defaultCurrency ?? "AUD"}
                maxLength={3}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-200">
              Reply language
              <input
                name="replyLanguage"
                className="nc-input"
                placeholder="English"
                defaultValue={firstDayProfile.replyLanguage ?? "English"}
              />
            </label>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-200">
              Daily routine
              <textarea
                name="dailyRoutine"
                className="nc-input min-h-28"
                placeholder="Example: school run in the morning, work calls after 10 am, quiet after 8 pm"
                defaultValue={firstDayProfile.dailyRoutine ?? ""}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-200">
              Important people
              <textarea
                name="importantPeople"
                className="nc-input min-h-28"
                placeholder="Example: Mukesh is family, John is work, ask before messaging anyone"
                defaultValue={firstDayProfile.importantPeople ?? ""}
              />
            </label>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-200">
              Preferred channels
              <textarea
                name="preferredChannels"
                className="nc-input min-h-24"
                placeholder="Example: WhatsApp for quick things, dashboard for review, drafts before SMS/email"
                defaultValue={firstDayProfile.preferredChannels ?? ""}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-200">
              First three jobs to automate
              <textarea
                name="firstThreeJobs"
                className="nc-input min-h-24"
                placeholder={"1. Remind me about calls\n2. Track expenses in AUD\n3. Summarise bills before due dates"}
                defaultValue={firstDayProfile.firstThreeJobs ?? ""}
              />
            </label>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-800 pt-5 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-slate-500">
              Risk rule: NitsyClaw can use this context for bill summaries, expense logs, due-date reminders, replies, and drafts. Sending, calling, booking, deleting, or paying still needs confirmation.
            </p>
            <button className="nc-button-primary min-h-11 px-5" type="submit">
              Save PA profile
            </button>
          </div>
        </form>
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
        <div className="nc-eyebrow">Supporting features only</div>
        <h3 className="mt-2 text-xl font-semibold text-slate-100">Drafts and memory are supporting features.</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          For this validation build, the product is not trying to be everything. Drafts help with bill complaints and hard messages.
          Memory helps remember recurring details. The demo promise stays focused on bills, receipts, expenses, and reminders.
        </p>
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

function readProfileText(value: Record<string, unknown> | undefined, key: "location" | "value"): string | undefined {
  const text = value?.[key];
  return typeof text === "string" && text.trim() ? text.trim() : undefined;
}

function cleanText(value: FormDataEntryValue | null, maxLength: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanCurrency(value: FormDataEntryValue | null): string {
  const currency = cleanText(value, 3).toUpperCase() || "AUD";
  return /^[A-Z]{3}$/.test(currency) ? currency : "AUD";
}

function splitLines(value: string): string[] {
  return value
    .split(/\d+\.|\n|;/)
    .map((line) => line.replace(/^[-\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
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
