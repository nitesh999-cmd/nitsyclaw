import { WhatsApp, LinkedIn, Mail } from "./icons";
import { SITE, whatsappHref, mailtoHref } from "@/lib/site";

const COLUMNS = [
  {
    title: "Explore",
    links: [
      { label: "The leaks", href: "#leaks" },
      { label: "2-min leak scan", href: "#scorecard" },
      { label: "What I fix", href: "#fix" },
      { label: "Ways to start", href: "#offers" },
    ],
  },
  {
    title: "More",
    links: [
      { label: "The Fix Framework", href: "#method" },
      { label: "Who I help", href: "#about" },
      { label: "FAQ", href: "#faq" },
      { label: "Contact", href: "#contact" },
    ],
  },
];

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="container-page py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
          {/* brand */}
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink text-xs font-bold text-white">
                NB
              </span>
              <span className="text-sm font-semibold text-ink">
                {SITE.name} — {SITE.role}
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm text-slate-500">
              Helping Australian service, solar, energy, trade, and founder-led
              businesses stop leaking revenue after the lead comes in.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:text-ink"
              >
                <WhatsApp className="h-4 w-4" />
              </a>
              <a
                href={SITE.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:text-ink"
              >
                <LinkedIn className="h-4 w-4" />
              </a>
              <a
                href={mailtoHref}
                aria-label="Email"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:text-ink"
              >
                <Mail className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* sitemap columns */}
          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {col.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      className="text-sm text-slate-600 transition hover:text-ink"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-6 sm:flex-row">
          <p className="text-xs text-slate-500">
            © {year} {SITE.name}. Melbourne, Australia.
          </p>
          <p className="text-xs text-slate-400">
            Built for sharper execution and cleaner growth.
          </p>
        </div>
      </div>
    </footer>
  );
}
