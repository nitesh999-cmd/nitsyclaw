const demoSteps = [
  {
    title: "1. Prove WhatsApp is alive",
    command: "proof test",
    success: "It confirms inbound routing, outbound delivery, database marker, bot runtime, WhatsApp client, send status, and loop guard.",
  },
  {
    title: "2. Summarise a bill",
    command: "bill summary: AGL bill $240 due 18 May ref 12345",
    success: "It extracts provider, amount, due date, reference, and suggests a reminder.",
  },
  {
    title: "3. Log an expense",
    command: "I spent $18.40 at Chemist Warehouse for medicine",
    success: "It logs the expense in AUD by default with merchant, amount, category, and date.",
  },
  {
    title: "4. Create a due-date reminder",
    command: "Remind me to pay AGL on 17 May at 9 am",
    success: "It saves a clear reminder and shows the date and time back in plain English.",
  },
  {
    title: "5. Ask for the weekly digest",
    command: "weekly admin digest",
    success: "It gives a short life-admin summary covering bills, reminders, expenses, and pending admin tasks.",
  },
  {
    title: "6. Check failure state",
    command: "what went wrong",
    success: "It reports recent failures and loop-guard status without exposing secrets.",
  },
];

const successSignals = [
  "Replies are short, useful, and in English.",
  "Expenses default to AUD unless the user asks for another supported currency.",
  "Bills and receipts produce a next action, not just a summary.",
  "Risky actions are drafted or held for confirmation.",
  "Unavailable integrations are clearly marked as not live.",
  "The bot does not send a separate progress acknowledgement before the real answer.",
];

const notInDemo = [
  "Gmail or Outlook mailbox actions",
  "Google Drive, OneDrive, or Google Photos browsing",
  "Spotify account actions",
  "SMS sending or phone calls",
  "Bank feeds, birthdays, or social video analysis",
  "Public sale, self-serve tenant signup, or multi-customer rollout",
];

export default function DemoPage() {
  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Controlled validation</div>
        <h2 className="mt-2 text-3xl font-semibold">Demo checklist</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          Use this page to test the WhatsApp life-admin command centre before any concierge beta or public sale.
          The demo is limited to bills, receipts, expenses, due-date reminders, weekly digest, drafts, and safety checks.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href="/chat" className="nc-button-primary">Open Ask</a>
          <a href="/help" className="nc-button">Command guide</a>
          <a href="/privacy-center" className="nc-button">Privacy limits</a>
        </div>
      </section>

      <section className="nc-section">
        <div className="nc-eyebrow">Run these in WhatsApp</div>
        <div className="mt-4 grid gap-3">
          {demoSteps.map((step) => (
            <article key={step.title} className="nc-tile">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">{step.title}</h3>
                  <p className="mt-2 text-xs leading-5 text-slate-400">{step.success}</p>
                </div>
                <code className="rounded-lg border border-[#d8b75d]/30 bg-[#d8b75d]/10 px-3 py-2 text-xs text-[#f2d98b]">
                  {step.command}
                </code>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="nc-section grid gap-4 md:grid-cols-2">
        <div className="nc-tile">
          <h3 className="font-medium text-slate-100">Success signals</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            {successSignals.map((signal) => (
              <li key={signal} className="border-l-2 border-[#d8b75d]/40 pl-3">{signal}</li>
            ))}
          </ul>
        </div>

        <div className="nc-tile">
          <h3 className="font-medium text-slate-100">Not part of this demo</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            {notInDemo.map((item) => (
              <li key={item} className="border-l-2 border-slate-700 pl-3">{item}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
