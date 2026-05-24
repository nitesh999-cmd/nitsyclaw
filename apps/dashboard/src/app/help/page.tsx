const groups = [
  {
    title: "Weekly command centre",
    examples: [
      "weekly admin digest",
      "what's coming up this week?",
      "show my admin inbox",
    ],
  },
  {
    title: "Bills and receipts",
    examples: [
      "bill summary: AGL bill $240 due 18 May",
      "Upload a receipt photo on WhatsApp",
      "check before send: I am angry about this bill",
    ],
  },
  {
    title: "Expenses",
    examples: [
      "I spent $18.40 at Chemist Warehouse for medicine",
      "expense summary",
      "find expense chemist",
    ],
  },
  {
    title: "Reminders",
    examples: [
      "Remind me to call Sam tomorrow at 9am",
      "What reminders are pending?",
      "Remind me every Friday to review invoices",
    ],
  },
  {
    title: "Memory and search",
    examples: [
      "Remember my passport is in the black folder",
      "Search my saved notes for passport",
      "List my can't-do items",
    ],
  },
  {
    title: "Drafting support",
    examples: [
      "draft sms to John saying I am running late",
      "call script: energy retailer | ask for a better rate",
      "complaint: AGL | bill looks wrong | explain and fix it",
    ],
  },
  {
    title: "Not live yet",
    examples: [
      "Gmail, Outlook, Drive, Photos, Spotify, SMS sending, calls, and bank feeds need setup first.",
      "NitsyClaw can draft or queue requests, but it will not pretend live account access exists.",
      "Sending, calling, deleting, booking, paying, or changing outside data needs confirmation.",
    ],
  },
];

const safety = [
  "NitsyClaw asks before sending, deleting, scheduling, or changing important things.",
  "The controlled demo is focused on WhatsApp bills, receipts, expenses, due-date reminders, and weekly admin digest.",
  "Gmail, Outlook, Drive, Photos, Spotify, SMS sending, calls, bank feeds, birthdays, and social video are not live.",
  "For risky integrations, NitsyClaw drafts or queues requests instead of pretending broad access exists.",
];

const websiteMap = [
  {
    title: "Today",
    href: "/",
    description: "Today is the daily home base for reminders, approvals, spending, and what needs attention.",
  },
  {
    title: "Chat",
    href: "/chat",
    description: "Chat is where you ask NitsyClaw for help in normal language.",
  },
  {
    title: "Confirmations",
    href: "/confirmations",
    description: "Confirmations is where risky actions wait for approval before anything important changes.",
  },
  {
    title: "Reminders",
    href: "/reminders",
    description: "Reminders shows scheduled personal tasks and follow-ups.",
  },
  {
    title: "Memory",
    href: "/memory",
    description: "Memory shows saved personal notes and facts NitsyClaw can reuse.",
  },
  {
    title: "Privacy",
    href: "/privacy-center",
    description: "Privacy explains stored data, export/delete controls, and current safety limits.",
  },
];

export default function HelpPage() {
  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Usage guide</div>
        <h2 className="mt-2 text-3xl font-semibold">WhatsApp life-admin commands</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Use normal language. Start with bills, receipts, expenses, reminders, and the weekly admin digest.
        </p>
      </section>

      <section className="nc-section">
        <div className="nc-eyebrow">Website map</div>
        <div className="mt-2 text-sm leading-6 text-slate-400">
          Start with Today for daily use, Ask for questions, Reminders for due dates, and Spending for receipts.
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {websiteMap.map((item) => (
            <a key={item.title} href={item.href} className="nc-tile transition-colors hover:border-[#d8b75d]/40">
              <div className="text-sm font-semibold text-slate-100">{item.title}</div>
              <div className="mt-2 text-xs leading-5 text-slate-400">{item.description}</div>
            </a>
          ))}
        </div>
      </section>

      <section className="nc-section grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <div key={group.title} className="nc-tile">
            <h3 className="font-medium text-slate-100">{group.title}</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {group.examples.map((example) => (
                <li key={example} className="border-l-2 border-[#d8b75d]/40 pl-3 text-slate-400">{example}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="nc-section">
        <h3 className="nc-eyebrow mb-3">Safety model</h3>
        <ul className="space-y-2 text-sm text-slate-400">
          {safety.map((line) => (
            <li key={line} className="flex gap-2">
              <span className="mt-0.5 shrink-0 text-[#d8b75d]/70">-</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
