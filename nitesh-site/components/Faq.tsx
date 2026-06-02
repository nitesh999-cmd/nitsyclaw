const FAQS = [
  {
    q: "It's just you — what happens if you get sick or overcommitted?",
    a: "You deal directly with me, not a junior or a call centre, and I deliberately cap how many clients I take on so nothing slips. If something urgent comes up, I tell you straight and we adjust the timeline together.",
  },
  {
    q: "How much does this cost?",
    a: "Most work runs as fixed-scope sprints, so you know the price and the deliverable before you commit — no open-ended hourly bills and no surprise invoices. We start with a 90-minute audit and size anything bigger from there.",
  },
  {
    q: "I'm flat out — how much of my time will this take?",
    a: "The first call is short, and after that I do the heavy lifting. I'll usually need an hour or two of your input up front, then I work in the background and report back in plain English.",
  },
  {
    q: "Will you actually understand a business like mine?",
    a: "I focus on solar, energy, trades and owner-led service businesses, so I already know your bottlenecks — quotes that don't get followed up, leads that go cold, and admin eating your evenings.",
  },
  {
    q: "What if the audit isn't worth it?",
    a: "The first paid step is a fixed-fee audit, and you walk away with at least three specific, ranked fixes. If I can't give you that, the audit's free — I'd rather lose the fee than your trust.",
  },
  {
    q: "Are you going to lock me into a long retainer?",
    a: "No lock-in. We start with one scoped piece of work; if you want to keep going after that, great, but it's always your call.",
  },
  {
    q: "Is my customer and business data safe with you?",
    a: "I only access what's needed to do the job, I don't share it with anyone, and where possible I work inside your own tools so your data stays in your accounts.",
  },
  {
    q: "You're building your client list — why should I trust you?",
    a: "Fair question, and I'd rather be upfront about it: that's exactly why the first step is low-risk and fixed-fee. You're trusting a clear process and a real local person in Melbourne — not a faceless agency.",
  },
];

function PlusIcon() {
  return (
    <svg
      className="faq-icon h-5 w-5 shrink-0 text-accent-strong"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export default function Faq() {
  return (
    <section id="faq" className="reveal bg-white py-20 sm:py-24">
      <div className="container-page">
        <div className="max-w-3xl">
          <span className="eyebrow">Straight answers</span>
          <h2 className="section-title mt-4">
            The questions a sharp owner asks first
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            No dodging. Here are the things people want to know before they get
            in touch.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-3xl divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-6 shadow-card sm:px-8">
          {FAQS.map((item) => (
            <details key={item.q} name="faq" className="faq-item group py-1">
              <summary className="flex items-center justify-between gap-4 py-4 text-base font-semibold text-ink">
                {item.q}
                <PlusIcon />
              </summary>
              <p className="pb-5 pr-10 text-sm leading-relaxed text-slate-600">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
