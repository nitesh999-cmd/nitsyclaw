import { Mail, Phone, WhatsApp, LinkedIn, MapPin } from "./icons";
import { SITE, mailtoHref, whatsappHref } from "@/lib/site";

export default function Contact() {
  return (
    <section id="contact" className="bg-slate-50 py-20 sm:py-24">
      <div className="container-page">
        <div className="max-w-3xl">
          <span className="eyebrow">Contact</span>
          <h2 className="section-title mt-4">
            Book a Growth Fix Call — or just send the problem.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            The fastest way to start is to tell me what is not working. Email or
            WhatsApp me a few lines about where you think you&apos;re leaking
            revenue, and I&apos;ll come back with a straight read on what to fix
            first.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <a
            href={mailtoHref}
            className="card card-hover flex items-start gap-4"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink text-white">
              <Mail className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">Email</span>
              <span className="mt-1 block break-all text-sm text-slate-600">
                {SITE.email}
              </span>
            </span>
          </a>

          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="card card-hover flex items-start gap-4"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#25D366] text-white">
              <WhatsApp className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">
                Phone / WhatsApp
              </span>
              <span className="mt-1 block text-sm text-slate-600">
                {SITE.phone}
              </span>
            </span>
          </a>

          <a
            href={SITE.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="card card-hover flex items-start gap-4"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0A66C2] text-white">
              <LinkedIn className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">
                LinkedIn
              </span>
              <span className="mt-1 block text-sm text-slate-600">
                /in/niteshbasudkar
              </span>
            </span>
          </a>
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <a href={mailtoHref} className="btn-primary text-base">
            <Mail className="h-4 w-4" />
            Email Nitesh
          </a>
          <a
            href={`tel:${SITE.phone.replace(/\s/g, "")}`}
            className="btn-secondary text-base"
          >
            <Phone className="h-4 w-4" />
            Call {SITE.phone}
          </a>
        </div>

        <p className="mt-10 inline-flex items-center gap-2 text-sm text-slate-500">
          <MapPin className="h-4 w-4" />
          Based in Melbourne. Working with Australian businesses that want
          sharper execution and cleaner growth.
        </p>
      </div>
    </section>
  );
}
