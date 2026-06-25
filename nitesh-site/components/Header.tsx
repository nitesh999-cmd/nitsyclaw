"use client";

import { useEffect, useState } from "react";
import { NAV_LINKS, mailtoHref } from "@/lib/site";

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu on Escape and lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Solid bar once scrolled or while the menu is open; otherwise transparent
  // and overlapping the dark hero (which needs light-on-dark text).
  const solid = scrolled || open;

  return (
    <header
      className={`sticky top-0 z-40 transition-colors duration-200 ${
        solid
          ? "border-b border-slate-200 bg-white/85 backdrop-blur"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <nav
        className="container-page flex h-16 items-center justify-between"
        aria-label="Primary"
      >
        <a href="#top" className="flex items-center gap-2.5">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold transition-colors ${
              solid ? "bg-ink text-white" : "bg-white text-ink"
            }`}
          >
            NB
          </span>
          <span className="flex flex-col leading-none">
            <span
              className={`text-sm font-bold transition-colors ${
                solid ? "text-ink" : "text-white"
              }`}
            >
              Nitesh Basudkar
            </span>
            <span
              className={`text-[11px] font-medium uppercase tracking-wider transition-colors ${
                solid ? "text-slate-500" : "text-slate-300"
              }`}
            >
              Sales &amp; Operations Fixer
            </span>
          </span>
        </a>

        <div className="hidden items-center gap-7 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition ${
                solid
                  ? "text-slate-600 hover:text-ink"
                  : "text-slate-200 hover:text-white"
              }`}
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden lg:block">
          <a href="#contact" className="btn-primary">
            Book a Growth Fix Call
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border transition-colors lg:hidden ${
            solid ? "border-slate-200 text-ink" : "border-white/30 text-white"
          }`}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label="Toggle navigation menu"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            {open ? (
              <path d="M6 6l12 12M18 6 6 18" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
      </nav>

      {open && (
        <div
          id="mobile-menu"
          className="border-t border-slate-200 bg-white lg:hidden"
        >
          <div className="container-page flex flex-col gap-1 py-4">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2">
              <a
                href="#contact"
                onClick={() => setOpen(false)}
                className="btn-primary w-full"
              >
                Book a Growth Fix Call
              </a>
              <a
                href={mailtoHref}
                onClick={() => setOpen(false)}
                className="btn-secondary w-full"
              >
                Send Me the Problem
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
