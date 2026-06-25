import { Check } from "./icons";

// Illustrative product panel: shows the "lead-to-cash" rhythm becoming
// disciplined. These are conceptual workflow states, NOT real client data,
// metrics, or guarantees — kept deliberately qualitative.
const STEPS = [
  { label: "New enquiry", state: "Logged & assigned" },
  { label: "Quote sent", state: "Chase scheduled" },
  { label: "Follow-up due", state: "Reminder set" },
  { label: "Sales → admin", state: "Handover noted" },
  { label: "Compliance step", state: "Checklist done" },
];

export default function HeroPanel() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:mx-0">
      {/* glow behind the panel */}
      <div
        className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-accent/30 via-teal-400/10 to-sky-500/20 blur-2xl"
        aria-hidden="true"
      />

      <div className="border-white/12 relative animate-float-slow rounded-2xl border bg-white/[0.06] p-5 shadow-card-lg backdrop-blur-xl">
        {/* window chrome */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
            Lead-to-cash rhythm
          </span>
        </div>

        {/* checklist that "fixes" itself top to bottom */}
        <ul className="mt-4 space-y-2.5">
          {STEPS.map((step, i) => (
            <li
              key={step.label}
              className="flex animate-pop-in items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5"
              style={{ animationDelay: `${0.25 + i * 0.18}s` }}
            >
              <span className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-accent-soft ring-1 ring-accent/40">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm font-medium text-white">
                  {step.label}
                </span>
              </span>
              <span className="text-xs font-medium text-emerald-300/90">
                {step.state}
              </span>
            </li>
          ))}
        </ul>

        {/* operating-rhythm progress */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-300">Operating rhythm</span>
            <span className="font-semibold text-emerald-300">
              Nothing slipping
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full origin-left animate-bar-grow rounded-full bg-gradient-to-r from-accent-soft to-teal-300"
              style={{ width: "92%" }}
            />
          </div>
        </div>
      </div>

      {/* floating accent chip */}
      <div className="border-white/12 absolute -bottom-5 -left-3 hidden animate-float items-center gap-2 rounded-xl border bg-ink/80 px-3.5 py-2.5 shadow-card-lg backdrop-blur-xl sm:flex">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-strong text-white">
          <Check className="h-4 w-4" />
        </span>
        <span className="text-xs font-semibold text-white">
          Built so leads don&apos;t go cold
        </span>
      </div>
    </div>
  );
}
