import { Check } from "./icons";

const OUTCOMES = [
  {
    title: "More disciplined follow-up",
    body: "Every enquiry and quote has a clear next step and an owner — nothing relies on memory.",
  },
  {
    title: "Faster response times",
    body: "Buyers hear back while they are still warm, not days later when they have moved on.",
  },
  {
    title: "Cleaner handovers",
    body: "Sales, admin, and delivery share the same context, so promises are kept.",
  },
  {
    title: "Better visibility for owners",
    body: "You can see what is in play and what is at risk without chasing the team for updates.",
  },
];

export default function BigPromise() {
  return (
    <section className="bg-ink py-20 text-white sm:py-24">
      <div className="container-page">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <span className="eyebrow-dark">The goal</span>
            <h2 className="section-title-light mt-4">
              Turn business chaos into a simple operating system.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-300">
              The goal is not to add more noise. The goal is to make the
              important things visible, repeatable, trackable, and easier for
              the team to follow.
            </p>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2">
            {OUTCOMES.map((o) => (
              <li
                key={o.title}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-6"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent-soft">
                  <Check className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-white">
                  {o.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  {o.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
