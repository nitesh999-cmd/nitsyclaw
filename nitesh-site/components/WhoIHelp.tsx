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

export default function WhoIHelp() {
  return (
    <section className="bg-white py-20 sm:py-24">
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
      </div>
    </section>
  );
}
