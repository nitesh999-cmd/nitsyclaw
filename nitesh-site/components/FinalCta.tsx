import { Mail, WhatsApp, LinkedIn } from "./icons";
import { SITE, mailtoHref, whatsappHref } from "@/lib/site";

export default function FinalCta() {
  return (
    <section className="bg-white py-20 sm:py-24">
      <div className="container-page">
        <div className="relative overflow-hidden rounded-3xl bg-ink px-6 py-14 text-center text-white sm:px-12 sm:py-16">
          <div
            className="pointer-events-none absolute inset-0 bg-grid-faint opacity-30 [background-size:40px_40px]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-accent/20 blur-3xl"
            aria-hidden="true"
          />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
              Send me the mess. I&apos;ll help you find the leak and build the
              next move.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-300">
              Whether the problem is sales, follow-up, operations, compliance,
              or team workflow, the first step is simple: show me what is not
              working.
            </p>

            <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row">
              <a href={mailtoHref} className="btn-primary text-base">
                <Mail className="h-4 w-4" />
                Email Nitesh
              </a>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost-light text-base"
              >
                <WhatsApp className="h-4 w-4" />
                WhatsApp Nitesh
              </a>
              <a
                href={SITE.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost-light text-base"
              >
                <LinkedIn className="h-4 w-4" />
                View LinkedIn
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
