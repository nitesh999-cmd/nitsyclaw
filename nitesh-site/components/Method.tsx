const STEPS = [
  {
    n: 1,
    title: "Diagnose the leak",
    body: "We identify where time, leads, money, and accountability are leaking.",
  },
  {
    n: 2,
    title: "Simplify the process",
    body: "We remove unnecessary steps, confusing tools, and messy handovers.",
  },
  {
    n: 3,
    title: "Build the workflow",
    body: "We turn the important work into checklists, templates, workflows, and follow-up rhythms.",
  },
  {
    n: 4,
    title: "Train the team",
    body: "We make the system simple enough for the team to actually use.",
  },
  {
    n: 5,
    title: "Review and tighten",
    body: "We review what is working, what is still leaking, and what needs improving next.",
  },
];

export default function Method() {
  return (
    <section id="method" className="reveal bg-slate-50 py-20 sm:py-24">
      <div className="container-page">
        <div className="max-w-3xl">
          <span className="eyebrow">How it works</span>
          <h2 className="section-title mt-4">The Fix Framework</h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            A straightforward path from &ldquo;something is leaking&rdquo; to a
            system the team runs on its own.
          </p>
        </div>

        <ol className="relative mt-12 grid gap-8 md:grid-cols-5 md:gap-4">
          {/* connecting line across the row (desktop) */}
          <span
            aria-hidden="true"
            className="absolute left-5 top-5 hidden h-px w-[calc(100%-2.5rem)] bg-gradient-to-r from-accent-strong/40 via-accent-strong/30 to-transparent md:block"
          />
          {STEPS.map((step) => (
            <li key={step.n} className="relative">
              <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-accent-strong text-base font-bold text-white ring-4 ring-slate-50">
                {step.n}
              </span>
              <h3 className="mt-4 text-base font-semibold text-ink">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
