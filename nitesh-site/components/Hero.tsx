import { ArrowRight, Check } from "./icons";
import { mailtoHref } from "@/lib/site";
import HeroPanel from "./HeroPanel";

const HERO_BULLETS = [
  "Lead handling",
  "Quote follow-up",
  "Sales/admin handovers",
  "Compliance steps",
  "AI & automation workflows",
];

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-ink text-white">
      {/* layered aurora + grid backdrop */}
      <div
        className="pointer-events-none absolute inset-0 bg-grid-faint opacity-40 [background-size:48px_48px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -left-40 top-[-15%] h-[34rem] w-[34rem] animate-aurora rounded-full bg-accent/25 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute left-1/3 top-1/4 h-[26rem] w-[26rem] animate-aurora rounded-full bg-teal-400/15 blur-3xl [animation-delay:-6s]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-[-25%] right-[-12%] h-[30rem] w-[30rem] animate-aurora rounded-full bg-sky-500/15 blur-3xl [animation-delay:-3s]"
        aria-hidden="true"
      />
      {/* top + bottom vignette for depth */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-ink"
        aria-hidden="true"
      />

      <div className="container-page relative py-20 sm:py-24 lg:py-28">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
          {/* ===== left: message ===== */}
          <div className="animate-fade-up">
            <span className="eyebrow-dark">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-soft opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-soft" />
              </span>
              Melbourne-based · Working with Australian businesses
            </span>

            <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Stop losing{" "}
              <span className="relative whitespace-nowrap">
                <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-emerald-300 bg-clip-text text-transparent">
                  revenue
                </span>
                <svg
                  className="absolute -bottom-2 left-0 h-3 w-full text-accent-soft/70"
                  viewBox="0 0 200 12"
                  fill="none"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2 9C40 4 160 3 198 8"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </span>{" "}
              after the lead comes in.
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
              I help Australian service, solar, energy, trade, and founder-led
              businesses tighten follow-up, clean up handovers, improve
              compliance discipline, and build practical sales systems their
              teams actually use.
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
              <a
                href="#contact"
                className="btn-primary group relative overflow-hidden text-base"
              >
                {/* sheen */}
                <span
                  className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full"
                  aria-hidden="true"
                />
                <span className="relative inline-flex items-center gap-2">
                  Book a Growth Fix Call
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </a>
              <a href={mailtoHref} className="btn-ghost-light text-base">
                Send Me the Problem
              </a>
            </div>

            <p className="mt-6 max-w-xl text-sm text-slate-400">
              No fluff. No long reports. Just practical clarity on what is
              leaking and what to fix first.
            </p>
          </div>

          {/* ===== right: product panel ===== */}
          <div className="animate-fade-up [animation-delay:0.15s]">
            <HeroPanel />
          </div>
        </div>
      </div>
    </section>
  );
}
