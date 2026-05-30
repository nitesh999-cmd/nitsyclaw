const SERVICES = [
  {
    n: "01",
    title: "Lead Handling",
    body: "Make sure new enquiries are captured, qualified, and followed up properly.",
  },
  {
    n: "02",
    title: "Quote & Proposal Follow-Up",
    body: "Build a simple chase rhythm so warm opportunities do not disappear.",
  },
  {
    n: "03",
    title: "Sales-to-Admin Handover",
    body: "Create cleaner handovers so the team knows what was promised, what is next, and who owns it.",
  },
  {
    n: "04",
    title: "Compliance & Process Discipline",
    body: "Turn critical steps into checklists and workflows so they do not get missed under pressure.",
  },
  {
    n: "05",
    title: "AI & Automation Workflow Upgrade",
    body: "Use AI, templates, CRM improvements, and automation to reduce manual work and improve consistency.",
  },
];

export default function WhatIFix() {
  return (
    <section id="fix" className="reveal bg-slate-50 py-20 sm:py-24">
      <div className="container-page">
        <div className="max-w-3xl">
          <span className="eyebrow">What I help fix</span>
          <h2 className="section-title mt-4">
            Five places revenue quietly slips away — and how I close them.
          </h2>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s) => (
            <article
              key={s.n}
              className="card card-hover flex flex-col"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-sm font-bold text-white">
                {s.n}
              </span>
              <h3 className="mt-5 text-lg font-semibold text-ink">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {s.body}
              </p>
            </article>
          ))}

          <article className="flex flex-col justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6">
            <p className="text-sm leading-relaxed text-slate-600">
              Not sure which one is costing you most right now?
            </p>
            <a
              href="#offers"
              className="mt-3 text-sm font-semibold text-accent-strong hover:underline"
            >
              Start with a 90-minute leak audit →
            </a>
          </article>
        </div>
      </div>
    </section>
  );
}
