import { ArrowRight, Check } from "./icons";
import { whatsAppLink } from "@/lib/site";

type Offer = {
  name: string;
  bestFor: string;
  includes: string[];
  cta: string;
  featured?: boolean;
  tag: string;
  note?: string;
};

const OFFERS: Offer[] = [
  {
    tag: "Audit",
    name: "90-Minute Revenue Leak Audit",
    bestFor: "Owners who want fast clarity.",
    includes: [
      "Sales process review",
      "Follow-up gap review",
      "Quote/proposal chase review",
      "Operational bottleneck review",
      "Compliance/process risk notes",
      "Top 5 fixes ranked by impact",
    ],
    cta: "Start With an Audit",
    note: "You walk away with at least 3 specific, ranked fixes. If I can't give you that, the audit's free — your call.",
  },
  {
    tag: "Recommended start",
    name: "7-Day Quote Chase & Follow-Up System",
    bestFor: "Businesses losing leads after enquiry, proposal, or first call.",
    includes: [
      "Follow-up templates",
      "Quote chase rhythm",
      "Objection handling notes",
      "CRM or spreadsheet improvement",
      "Simple team follow-up rules",
    ],
    cta: "Fix Follow-Up",
    featured: true,
  },
  {
    tag: "Operating system",
    name: "30-Day Sales-to-Delivery Operating System",
    bestFor:
      "Teams that need a cleaner operating rhythm across sales, admin, delivery, compliance, and reporting.",
    includes: [
      "Sales workflow",
      "Admin handover process",
      "Compliance checklist structure",
      "Reporting rhythm",
      "AI/template support",
      "Weekly implementation check-ins",
      "Final operating system map",
    ],
    cta: "Build the System",
  },
];

export default function Offers() {
  return (
    <section id="offers" className="reveal bg-white py-20 sm:py-24">
      <div className="container-page">
        <div className="max-w-3xl">
          <span className="eyebrow">Simple ways to start</span>
          <h2 className="section-title mt-4">
            Pick the level of help that fits where you are.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            Start small with a focused audit, fix follow-up in a week, or build
            a full operating rhythm in a month. Every engagement ends with
            something your team can actually use.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3 lg:items-start">
          {OFFERS.map((offer) => (
            <article
              key={offer.name}
              className={`relative flex h-full flex-col rounded-2xl border p-7 transition ${
                offer.featured
                  ? "gradient-border border-transparent bg-ink text-white shadow-card-lg lg:-translate-y-3"
                  : "border-slate-200 bg-white text-slate-700 shadow-card hover:-translate-y-0.5 hover:shadow-card-lg"
              }`}
            >
              <span
                className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                  offer.featured
                    ? "bg-accent-strong text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {offer.tag}
              </span>

              <h3
                className={`mt-4 text-xl font-bold ${
                  offer.featured ? "text-white" : "text-ink"
                }`}
              >
                {offer.name}
              </h3>

              <p
                className={`mt-2 text-sm ${
                  offer.featured ? "text-slate-300" : "text-slate-500"
                }`}
              >
                <span className="font-semibold">Best for: </span>
                {offer.bestFor}
              </p>

              <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                {offer.includes.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm">
                    <Check
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        offer.featured
                          ? "text-accent-soft"
                          : "text-accent-strong"
                      }`}
                    />
                    <span
                      className={
                        offer.featured ? "text-slate-200" : "text-slate-600"
                      }
                    >
                      {item}
                    </span>
                  </li>
                ))}
              </ul>

              {offer.note && (
                <p className="mt-5 rounded-xl border border-accent-strong/30 bg-accent-strong/[0.06] px-3.5 py-3 text-xs font-medium leading-relaxed text-accent-strong">
                  <span className="font-bold">Low-risk promise: </span>
                  {offer.note}
                </p>
              )}

              <a
                href={whatsAppLink(
                  `Hi Nitesh, I'm interested in the ${offer.name}. Can you tell me how it works and what it costs?`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-7 ${offer.featured ? "btn-primary" : "btn-secondary"}`}
              >
                {offer.cta}
                <ArrowRight className="h-4 w-4" />
              </a>
            </article>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-slate-500">
          Not sure which fits? Send the problem and I&apos;ll tell you straight
          which one is worth your money — or if you don&apos;t need me yet.
        </p>
      </div>
    </section>
  );
}
