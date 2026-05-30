const POINTS = [
  "Commercial Energy",
  "Solar / Battery / Lighting",
  "B2B Sales",
  "Operations Cleanup",
  "Compliance-Heavy Programs",
  "AI Workflow Improvement",
  "Field Execution",
  "Acquisitions",
  "Quote & Proposal Follow-Up",
];

function Pill({ label }: { label: string }) {
  return (
    <span className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 shadow-sm">
      {label}
    </span>
  );
}

export default function CredibilityStrip() {
  return (
    <section
      aria-label="Areas of hands-on experience"
      className="border-y border-slate-200 bg-slate-50 py-6"
    >
      <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        Hands-on experience across
      </p>
      <div className="marquee mt-4" role="presentation">
        <div className="marquee__track">
          {POINTS.map((p) => (
            <Pill key={p} label={p} />
          ))}
        </div>
        {/* duplicate track for a seamless loop; hidden from AT + reduced-motion */}
        <div className="marquee__track" aria-hidden="true">
          {POINTS.map((p) => (
            <Pill key={`${p}-dup`} label={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
