const POINTS = [
  "Commercial Energy",
  "Solar / Battery / Lighting",
  "B2B Sales",
  "Operations Cleanup",
  "Compliance-Heavy Programs",
  "AI Workflow Improvement",
  "Field Execution",
];

export default function CredibilityStrip() {
  return (
    <section
      aria-label="Areas of hands-on experience"
      className="border-y border-slate-200 bg-slate-50"
    >
      <div className="container-page py-6">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Hands-on experience across
        </p>
        <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-3">
          {POINTS.map((point) => (
            <li
              key={point}
              className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 shadow-sm"
            >
              {point}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
