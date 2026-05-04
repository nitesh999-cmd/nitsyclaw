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

export default function HelpPage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">What Can I Ask?</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Use normal language. These examples are rails, not commands you must memorize.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <div key={group.title} className="border border-neutral-800 p-4">
            <h3 className="font-medium">{group.title}</h3>
            <ul className="mt-3 space-y-2 text-sm text-neutral-300">
              {group.examples.map((example) => (
                <li key={example} className="border-l border-neutral-700 pl-3">{example}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section>
        <h3 className="mb-2 text-sm uppercase tracking-wide text-neutral-400">Safety</h3>
        <ul className="space-y-2 text-sm text-neutral-300">
          {safety.map((line) => <li key={line}>- {line}</li>)}
        </ul>
      </section>
    </div>
  );
}
