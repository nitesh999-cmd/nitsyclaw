import { Check } from "./icons";

const AUDIENCES = [
  "Solar and energy companies",
  "Service businesses",
  "Trade and contractor teams",
  "B2B sales teams",
  "Admin and operations teams",
  "Founder-led businesses",
  "Growing businesses with messy systems",
  "Teams that need discipline without over-complication",
];

const NOT_FOR = [
  "Pre-revenue startups with no leads coming in yet",
  "Owners looking for a magic fix without changing how the team works",
  "Anyone wanting more dashboards and theory instead of execution",
];

function XIcon() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export default function WhoIHelp() {
  return (
    <section className="reveal bg-white py-20 sm:py-24">
      <div className="container-page">
        <div className="max-w-3xl">
          <span className="eyebrow">Who I help</span>
          <h2 className="section-title mt-4">
            Built for businesses where execution matters
          </h2>
        </div>

        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map((a) => (
            <li
              key={a}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700"
            >
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" />
              {a}
            </li>
          ))}
        </ul>

        {/* Honesty filter — disqualifying language reads as confidence. */}
        <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Probably not a fit if…
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {NOT_FOR.map((n) => (
              <li key={n} className="flex items-start gap-3 text-sm text-slate-600">
                <XIcon />
                {n}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
