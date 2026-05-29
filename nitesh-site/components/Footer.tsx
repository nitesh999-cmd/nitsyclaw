import { SITE } from "@/lib/site";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="container-page flex flex-col items-center justify-between gap-4 py-8 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink text-xs font-bold text-white">
            NB
          </span>
          <span className="text-sm font-semibold text-ink">
            {SITE.name} — {SITE.role}
          </span>
        </div>
        <p className="text-center text-xs text-slate-500 sm:text-right">
          © {year} {SITE.name}. Melbourne, Australia.
        </p>
      </div>
    </footer>
  );
}
