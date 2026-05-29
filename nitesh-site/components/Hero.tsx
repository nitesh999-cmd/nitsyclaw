import { ArrowRight, Check } from "./icons";
import { mailtoHref } from "@/lib/site";

const HERO_BULLETS = [
  "Lead handling",
  "Quote follow-up",
  "Sales/admin handovers",
  "Compliance steps",
  "AI & automation workflows",
];

export default function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden bg-ink text-white"
    >
      {/* gradient + grid backdrop */}
      <div
        className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:48px_48px] opacity-40"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -left-32 top-[-10%] h-[28rem] w-[28rem] rounded-full bg-accent/20 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute right-[-10%] bottom-[-20%] h-[26rem] w-[26rem] rounded-full bg-sky-500/10 blur-3xl"
        aria-hidden="true"
      />

      <div className="container-page relative py-20 sm:py-24 lg:py-32">
        <div className="max-w-3xl animate-fade-up">
          <span className="eyebrow-dark">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-soft" />
            Melbourne-based · Working with Australian businesses
          </span>

          <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            Stop losing revenue
            <br className="hidden sm:block" /> after the lead comes in.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
            I help Australian service, solar, energy, trade, and founder-led
            businesses tighten follow-up, clean up handovers, improve compliance
            discipline, and build practical sales systems their teams actually
            use.
          </p>

          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-3">
            {HERO_BULLETS.map((bullet) => (
              <li
                key={bullet}
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-200"
              >
                <Check className="h-4 w-4 text-accent-soft" />
                {bullet}
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <a href="#contact" className="btn-primary text-base">
              Book a Growth Fix Call
              <ArrowRight className="h-4 w-4" />
            </a>
            <a href={mailtoHref} className="btn-ghost-light text-base">
              Send Me the Problem
            </a>
          </div>

          <p className="mt-6 max-w-xl text-sm text-slate-400">
            No fluff. No long reports. Just practical clarity on what is leaking
            and what to fix first.
          </p>
        </div>
      </div>
    </section>
  );
}
