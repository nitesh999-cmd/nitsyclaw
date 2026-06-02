import { Phone, WhatsApp, LinkedIn, MapPin } from "./icons";
import { SITE, whatsappHref, telHref, RESPONSE_LINE } from "@/lib/site";
import LeadForm from "./LeadForm";

const STEPS = [
  {
    n: 1,
    title: "You send the mess",
    body: "A few lines on what's not working — by form, WhatsApp, or a quick call.",
  },
  {
    n: 2,
    title: "I give you a straight read",
    body: "Usually same day — a first read on where you're likely leaking, or a time to talk it through.",
  },
  {
    n: 3,
    title: "We pick the right first step",
    body: "Audit, follow-up fix, or full system — only if it's worth your money.",
  },
];

export default function Contact() {
  return (
    <section id="contact" className="reveal bg-slate-50 py-20 sm:py-24">
      <div className="container-page">
        <div className="max-w-3xl">
          <span className="eyebrow">Contact</span>
          <h2 className="section-title mt-4">
            Show me what&apos;s not working.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            Tell me where you think you&apos;re leaking revenue and I&apos;ll
            come back with a straight read on what to fix first.{" "}
            <span className="font-semibold text-ink">{RESPONSE_LINE}</span>
          </p>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          {/* left: what happens next + direct channels */}
          <div>
            <ol className="space-y-4">
              {STEPS.map((s) => (
                <li key={s.n} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-strong text-sm font-bold text-white">
                    {s.n}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{s.title}</p>
                    <p className="mt-0.5 text-sm text-slate-600">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="btn h-12 flex-1 bg-[#25D366] text-ink shadow-card hover:brightness-95"
              >
                <WhatsApp className="h-4 w-4" />
                WhatsApp Nitesh
              </a>
              <a href={telHref} className="btn-secondary h-12 flex-1">
                <Phone className="h-4 w-4" />
                Call {SITE.phone}
              </a>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500">
              <a
                href={SITE.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 font-medium text-slate-600 hover:text-ink"
              >
                <LinkedIn className="h-4 w-4" />
                /in/niteshbasudkar
              </a>
              <a
                href={`mailto:${SITE.email}`}
                className="inline-flex items-center gap-2 font-medium text-slate-600 hover:text-ink"
              >
                {SITE.email}
              </a>
            </div>

            <p className="mt-8 inline-flex items-center gap-2 text-sm text-slate-500">
              <MapPin className="h-4 w-4" />
              Based in Melbourne. Working with Australian businesses that want
              sharper execution and cleaner growth.
            </p>
          </div>

          {/* right: the lead form */}
          <LeadForm />
        </div>
      </div>
    </section>
  );
}
