import { Phone, WhatsApp } from "./icons";
import { SITE, telHref, whatsappHref } from "@/lib/site";

// Mobile-only sticky bar: the two highest-converting actions for an AU
// owner on a phone — tap to call, tap to WhatsApp. 48px tap targets,
// safe-area inset for notched devices. Pure markup/CSS, no JS.
export default function StickyCtaBar() {
  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/90 px-3 pt-2.5 backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-md items-center gap-2.5">
        <a
          href={telHref}
          className="btn-secondary h-12 flex-1"
          aria-label={`Call Nitesh on ${SITE.phone}`}
        >
          <Phone className="h-4 w-4" />
          Call
        </a>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="btn h-12 flex-1 bg-[#25D366] text-ink shadow-card hover:brightness-95"
          aria-label="Message Nitesh on WhatsApp"
        >
          <WhatsApp className="h-4 w-4" />
          WhatsApp
        </a>
      </div>
    </div>
  );
}
