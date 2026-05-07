const groups = [
  {
    title: "Reminders",
    examples: [
      "Remind me to call Sam tomorrow at 9am",
      "What reminders are pending?",
      "Remind me every Friday to review invoices",
    ],
  },
  {
    title: "Memory",
    examples: [
      "Remember my passport is in the black folder",
      "What did I save about Spotify?",
      "List my can't-do items",
    ],
  },
  {
    title: "Email",
    examples: [
      "Search Gmail for Solar Harbour invoice",
      "Draft an email to Alex about tomorrow's meeting",
      "Show unread emails in the morning brief",
    ],
  },
  {
    title: "Files and photos",
    examples: [
      "Use this Google Drive link in the next build",
      "Queue these Google Photos for analysis",
      "Import this OneDrive file when storage access is ready",
    ],
  },
  {
    title: "Calendar",
    examples: [
      "What's on my plate today?",
      "Schedule a 30 minute call with Alex tomorrow afternoon",
      "Send my morning brief now",
    ],
  },
  {
    title: "Expenses",
    examples: [
      "Log $18.50 coffee at Starbucks",
      "What did I spend today?",
      "Upload a receipt photo on WhatsApp",
    ],
  },
  {
    title: "Spotify",
    examples: [
      "What are my top Spotify tracks?",
      "Search Spotify for Fred again",
      "Make a private playlist from these tracks",
    ],
  },
  {
    title: "Build queue",
    examples: [
      "/addfeature add Google Drive search",
      "Add a feature for birthday reminders",
      "Show the feature queue",
    ],
  },
  {
    title: "Safe external actions",
    examples: [
      "Prepare an SMS draft for Sam",
      "Queue a bank CSV import",
      "Analyze this public Instagram reel link",
    ],
  },
];

const safety = [
  "NitsyClaw asks before sending, deleting, scheduling, or changing important things.",
  "Dashboard chat can use tools, but some tools are WhatsApp/local-bot only.",
  "Phone/SMS, bank feeds, Drive, Photos, and Facebook need real platform permissions before live account access can work.",
  "For risky integrations, NitsyClaw queues selected-file/import/draft requests instead of pretending broad access exists.",
];

const websiteMap = [
  {
    title: "Today",
    href: "/",
    description: "Today is the daily home base: reminders, requests, approvals, spending, and what needs attention.",
  },
  {
    title: "Chat",
    href: "/chat",
    description: "Chat is where you ask NitsyClaw for help in normal language.",
  },
  {
    title: "Command",
    href: "/command",
    description: "Command is the planning desk for operator missions, build requests, and quick admin commands.",
  },
  {
    title: "Queue",
    href: "/queue",
    description: "Queue is the build/request backlog. It stores work; it does not auto-build or auto-deploy.",
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
    title: "Health",
    href: "/health",
    description: "Health shows WhatsApp and system status so you can see what is working.",
  },
  {
    title: "Settings",
    href: "/settings",
    description: "Settings holds privacy, export, and delete controls.",
  },
];

export default function HelpPage() {
  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Usage guide</div>
        <h2 className="mt-2 text-3xl font-semibold">What Can I Ask?</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Use normal language. These examples are rails, not commands you must memorize.
        </p>
      </section>

      <section className="nc-section">
        <div className="nc-eyebrow">Website map</div>
        <div className="mt-2 text-sm leading-6 text-slate-400">
          Start with Today for daily use, Chat for questions, Command for planning, and Queue for saved build requests.
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
