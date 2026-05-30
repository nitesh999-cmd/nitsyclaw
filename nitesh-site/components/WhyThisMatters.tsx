const POINTS = [
  "A missed follow-up can lose a deal.",
  "A slow proposal can cool a warm lead.",
  "A weak handover can damage trust.",
  "A missed compliance step can create risk.",
  "A confused team can slow the whole business.",
  "A better system compounds every week.",
];

export default function WhyThisMatters() {
  return (
    <section className="reveal bg-slate-50 py-20 sm:py-24">
      <div className="container-page">
        <div className="max-w-3xl">
          <span className="eyebrow">Why this matters</span>
          <h2 className="section-title mt-4">
            Small leaks become expensive when nobody owns them.
          </h2>
        </div>

        <ul className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2">
          {POINTS.map((point, i) => (
            <li
              key={point}
              className="flex items-center gap-4 bg-white px-6 py-6"
            >
              <span className="text-sm font-bold text-accent-strong">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-base font-medium text-ink">{point}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
