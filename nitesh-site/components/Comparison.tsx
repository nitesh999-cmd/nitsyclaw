import { Check } from "./icons";

const ROWS = [
  {
    label: "Cost to get moving",
    nothing: "$0 now — but lost deals add up every week",
    hire: "A full salary plus super and on-costs, before they ramp",
    fixer: "Fixed-scope sprints — you know the price up front",
  },
  {
    label: "Time to first improvement",
    nothing: "Never — it stays on the someday list",
    hire: "Weeks to hire, months to get traction",
    fixer: "First fixes mapped inside the first audit",
  },
  {
    label: "Who carries it",
    nothing: "You do — in your head, after hours",
    hire: "A new full-timer you now have to manage",
    fixer: "I do the heavy lifting and hand it back documented",
  },
  {
    label: "Commitment",
    nothing: "—",
    hire: "Permanent headcount and on-costs",
    fixer: "No lock-in — scoped work, your call to continue",
  },
];

const COLS = [
  { key: "nothing", title: "Do nothing", sub: "Keep carrying it", highlight: false },
  { key: "hire", title: "Hire full-time ops", sub: "Big, slow commitment", highlight: false },
  { key: "fixer", title: "Work with Nitesh", sub: "Fractional fixer", highlight: true },
] as const;

export default function Comparison() {
  return (
    <section className="reveal bg-ink py-20 text-white sm:py-24">
      <div className="container-page">
        <div className="max-w-3xl">
          <span className="eyebrow-dark">Your options</span>
          <h2 className="section-title-light mt-4">
            Doing nothing has a price too.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            You don&apos;t have to choose between leaving leaks to bleed and
            committing to an expensive full-time hire. Here&apos;s the honest
            comparison.
          </p>
        </div>

        {/* desktop table */}
        <div className="mt-10 hidden overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] md:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <td className="w-1/4 px-5 py-4" />
                {COLS.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={`px-5 py-4 align-top ${
                      c.highlight ? "bg-accent-strong/15" : ""
                    }`}
                  >
                    <span
                      className={`block text-base font-bold ${
                        c.highlight ? "text-accent-soft" : "text-white"
                      }`}
                    >
                      {c.title}
                    </span>
                    <span className="text-xs font-medium text-slate-400">
                      {c.sub}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-b border-white/5 last:border-0">
                  <th
                    scope="row"
                    className="px-5 py-4 text-left align-top font-semibold text-white"
                  >
                    {row.label}
                  </th>
                  <td className="px-5 py-4 align-top text-slate-300">
                    {row.nothing}
                  </td>
                  <td className="px-5 py-4 align-top text-slate-300">{row.hire}</td>
                  <td className="bg-accent-strong/15 px-5 py-4 align-top font-medium text-white">
                    <span className="inline-flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-soft" />
                      {row.fixer}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* mobile cards */}
        <div className="mt-8 grid gap-4 md:hidden">
          {COLS.map((c) => (
            <div
              key={c.key}
              className={`rounded-2xl border p-5 ${
                c.highlight
                  ? "border-accent-strong bg-accent-strong/10"
                  : "border-white/10 bg-white/[0.03]"
              }`}
            >
              <p
                className={`text-base font-bold ${
                  c.highlight ? "text-accent-soft" : "text-white"
                }`}
              >
                {c.title}
              </p>
              <p className="text-xs font-medium text-slate-400">{c.sub}</p>
              <ul className="mt-4 space-y-3">
                {ROWS.map((row) => (
                  <li key={row.label} className="text-sm">
                    <span className="block font-semibold text-white">
                      {row.label}
                    </span>
                    <span className="flex items-start gap-2 text-slate-300">
                      {c.highlight && (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-soft" />
                      )}
                      {row[c.key]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
