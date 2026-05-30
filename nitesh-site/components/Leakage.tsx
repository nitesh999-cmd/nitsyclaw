const LEAKS = [
  {
    n: "01",
    title: "Leads not followed up fast enough",
    body: "New enquiries sit while the buyer's attention moves on — or straight to a competitor who called back first.",
  },
  {
    n: "02",
    title: "Quotes sent but not chased properly",
    body: "Proposals go out and then go quiet. Warm opportunities cool because nobody owns the chase.",
  },
  {
    n: "03",
    title: "Customer objections not captured or reused",
    body: "The same questions get answered from scratch every time, instead of being turned into a repeatable response.",
  },
  {
    n: "04",
    title: "Sales and admin handovers breaking down",
    body: "What was promised in the sale gets lost on the way to delivery, and the customer feels the gap.",
  },
  {
    n: "05",
    title: "Compliance steps handled too late",
    body: "Critical paperwork and checks get rushed at the end, creating risk and rework under pressure.",
  },
  {
    n: "06",
    title: "Owners stuck doing everything",
    body: "The business runs out of the owner's head. Nothing moves cleanly when they are busy or away.",
  },
  {
    n: "07",
    title: "Too many tools, not enough process",
    body: "A CRM, a spreadsheet, a chat app, an inbox — and no single rhythm that ties them together.",
  },
  {
    n: "08",
    title: "No clear operating rhythm",
    body: "Without a weekly cadence, important work is reactive, inconsistent, and easy to drop.",
  },
];

export default function Leakage() {
  return (
    <section id="leaks" className="reveal bg-white py-20 sm:py-24">
      <div className="container-page">
        <div className="max-w-3xl">
          <span className="eyebrow">The real problem</span>
          <h2 className="section-title mt-4">
            Most businesses do not need more noise. They need fewer leaks.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            Leads come in. Quotes go out. Customers ask questions. Teams get
            busy. Follow-up slips. Admin loses context. Compliance steps get
            rushed. The owner becomes the memory of the business.
          </p>
        </div>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LEAKS.map((leak) => (
            <li key={leak.n} className="card card-hover">
              <span className="text-sm font-bold text-accent-strong">
                {leak.n}
              </span>
              <h3 className="mt-2 text-base font-semibold text-ink">
                {leak.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {leak.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
