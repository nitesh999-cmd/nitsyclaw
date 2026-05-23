import type { Metadata } from "next";
import { WaitlistInterestForm } from "./waitlist-form";

export const metadata: Metadata = {
  title: "Private WhatsApp PA For Life Admin",
  description:
    "NitsyClaw helps normal people handle reminders, expenses, bills, drafts, memory, and daily life admin from WhatsApp.",
};

const worksNow = [
  "Voice notes and normal questions",
  "Reminders, important notes, and memory",
  "AUD expense logging from text, receipts, and CSV",
  "Bill and document summaries",
  "SMS drafts, replies, complaints, and call scripts",
  "Proof checks, status, and clear safety boundaries",
];

const setupLater = [
  "Real Gmail and Outlook mailbox actions",
  "Google Drive, OneDrive, and Google Photos browsing",
  "Spotify account actions",
  "Phone/SMS sending, bank feeds, calls, and birthdays",
];

const tiers = [
  {
    name: "Beta",
    price: "Free",
    detail: "For early testers proving daily usefulness.",
    points: ["Core WhatsApp PA commands", "Limited monthly AI usage", "Bug and feedback priority"],
  },
  {
    name: "Personal",
    price: "AUD $15/mo",
    detail: "For one person who wants daily admin out of their head.",
    points: ["More replies and document summaries", "Memory review tools", "Priority reliability fixes"],
  },
  {
    name: "Setup Assist",
    price: "AUD $99+",
    detail: "For people who want help connecting accounts safely.",
    points: ["Guided provider setup", "Safety checks before live actions", "No broad access without consent"],
  },
];

const proofItems = [
  "Runs proof checks for WhatsApp routing, database marker, send state, and loop guard.",
  "Labels features as works now, draft-only, needs setup, or blocked.",
  "Asks before sending, calling, deleting, booking, paying, or changing external data.",
  "Does not claim provider integrations are connected until real setup proves it.",
];

export default function OfferPage() {
  return (
    <main className="min-h-screen bg-[#fffaf2] text-stone-950">
      <section className="mx-auto grid min-h-[92vh] w-full max-w-7xl gap-8 px-4 py-6 md:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="max-w-3xl">
          <div className="nc-eyebrow">NitsyClaw for normal humans</div>
          <h1 className="mt-4 text-4xl font-semibold leading-tight md:text-6xl">
            A private WhatsApp PA for the life admin that keeps piling up.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-stone-700 md:text-lg">
            Message once. NitsyClaw can remind, log, summarise, draft, remember, and show what still needs
            setup before it touches anything important.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <a href="#waitlist" className="nc-button-primary">Request beta access</a>
            <a href="#proof" className="nc-button">How it stays safe</a>
          </div>
          <div className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
            {["WhatsApp first", "Private by design", "No fake integrations"].map((item) => (
              <div key={item} className="rounded-xl border border-stone-300 bg-white/80 px-4 py-3 font-semibold shadow-sm">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-stone-300 bg-[#fffdf8] p-4 shadow-[0_30px_90px_rgba(70,48,23,0.16)]">
          <div className="rounded-[1.5rem] border border-stone-200 bg-[#f9f0df] p-4">
            <div className="text-xs font-semibold uppercase text-[#8e3f24]">WhatsApp demo</div>
            <div className="mt-4 space-y-3 text-sm">
              <Bubble side="right">Remind me to call Mukesh tomorrow at 10 am</Bubble>
              <Bubble side="left">Done. Reminder set for tomorrow at 10:00 AM.</Bubble>
              <Bubble side="right">I spent $18.40 at Chemist Warehouse for medicine</Bubble>
              <Bubble side="left">Expense logged: AUD 18.40. Category: health. Merchant: Chemist Warehouse.</Bubble>
              <Bubble side="right">What can you do?</Bubble>
              <Bubble side="left">I can answer, remind, log, summarise, draft, remember, and tell you what setup is missing.</Bubble>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-8 md:px-8 lg:grid-cols-2">
        <Panel title="Works now" items={worksNow} />
        <Panel title="Needs setup before live action" items={setupLater} tone="warn" />
      </section>

      <section id="proof" className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
        <div className="rounded-3xl border border-stone-300 bg-[#241f19] p-5 text-white shadow-[0_24px_70px_rgba(70,48,23,0.18)] md:p-8">
          <div className="text-xs font-semibold uppercase text-[#f0c36f]">Trust before automation</div>
          <h2 className="mt-3 max-w-3xl text-3xl font-semibold md:text-4xl">
            The promise is not "AI does everything." The promise is "you always know what happened."
          </h2>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {proofItems.map((item) => (
              <div key={item} className="rounded-2xl border border-white/15 bg-white/8 p-4 text-sm leading-6 text-stone-100">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="offer" className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
        <div className="mb-5">
          <div className="nc-eyebrow">Early offer shape</div>
          <h2 className="mt-2 text-3xl font-semibold">Start small, stay useful, avoid unlimited-cost promises.</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {tiers.map((tier) => (
            <article key={tier.name} className="rounded-3xl border border-stone-300 bg-[#fffdf8] p-5 shadow-[0_18px_48px_rgba(70,48,23,0.09)]">
              <div className="text-sm font-semibold text-[#8e3f24]">{tier.name}</div>
              <div className="mt-3 text-3xl font-semibold">{tier.price}</div>
              <p className="mt-2 min-h-12 text-sm leading-6 text-stone-600">{tier.detail}</p>
              <ul className="mt-4 space-y-2 text-sm text-stone-700">
                {tier.points.map((point) => (
                  <li key={point} className="rounded-xl border border-stone-200 bg-[#fbf8f2] px-3 py-2">{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section id="waitlist" className="mx-auto grid w-full max-w-7xl gap-4 px-4 pb-12 pt-6 md:px-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-3xl border border-stone-300 bg-[#fffdf8] p-5 md:p-8">
          <div className="nc-eyebrow">Best next launch step</div>
          <h2 className="mt-2 text-3xl font-semibold">Run a 10-person beta before taking public money.</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-700">
            The product is most credible when we can prove that real people used WhatsApp to save reminders, log
            expenses, summarise bills, draft hard messages, and recover cleanly when something went wrong.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <a href="/privacy" className="nc-button">Privacy promise</a>
            <a href="/terms" className="nc-button">Terms</a>
          </div>
        </div>
        <WaitlistInterestForm />
      </section>
    </main>
  );
}

function Bubble({ side, children }: { side: "left" | "right"; children: string }) {
  const align = side === "right" ? "ml-auto bg-[#d9fdd3]" : "mr-auto bg-white";
  return (
    <div className={`max-w-[86%] rounded-2xl border border-stone-200 px-4 py-3 leading-6 text-stone-900 shadow-sm ${align}`}>
      {children}
    </div>
  );
}

function Panel({ title, items, tone = "ready" }: { title: string; items: string[]; tone?: "ready" | "warn" }) {
  const itemClass = tone === "ready"
    ? "border-emerald-900/20 bg-emerald-50 text-stone-800"
    : "border-amber-900/30 bg-amber-50 text-stone-800";
  return (
    <div className="rounded-3xl border border-stone-300 bg-[#fffdf8] p-5 shadow-[0_18px_48px_rgba(70,48,23,0.09)]">
      <div className="nc-eyebrow">{title}</div>
      <ul className="mt-4 grid gap-2">
        {items.map((item) => (
          <li key={item} className={`rounded-xl border px-3 py-2 text-sm leading-6 ${itemClass}`}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
