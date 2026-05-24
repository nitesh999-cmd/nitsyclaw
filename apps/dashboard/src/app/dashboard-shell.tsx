"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navGroups = [
  {
    label: "Validation demo",
    items: [
      { href: "/", label: "Today", mark: "Home" },
      { href: "/chat", label: "Ask", mark: "Talk" },
      { href: "/reminders", label: "Reminders", mark: "Due" },
      { href: "/expenses", label: "Spending", mark: "AUD" },
      { href: "/confirmations", label: "Review", mark: "Yes" },
      { href: "/demo", label: "Demo checklist", mark: "Test" },
      { href: "/onboarding", label: "Demo setup", mark: "Start" },
    ],
  },
  {
    label: "Supporting",
    items: [
      { href: "/memory", label: "Memory", mark: "Keep" },
      { href: "/privacy-center", label: "Privacy", mark: "Trust" },
      { href: "/settings", label: "Settings", mark: "Safe" },
    ],
  },
];

const ownerToolItems = [
  { href: "/queue", label: "Requests", mark: "Next" },
  { href: "/command", label: "Work desk", mark: "Admin" },
  { href: "/release", label: "Release", mark: "Ship" },
  { href: "/health", label: "Health", mark: "OK" },
  { href: "/whatsapp-recovery", label: "WhatsApp recovery", mark: "WA" },
  { href: "/activity", label: "Activity", mark: "Now" },
  { href: "/search", label: "Search", mark: "Find" },
  { href: "/stats", label: "Stats", mark: "Data" },
  { href: "/profile", label: "Profile", mark: "Me" },
  { href: "/integrations", label: "Connections", mark: "Link" },
  { href: "/setup", label: "Setup", mark: "Start" },
  { href: "/help", label: "Help", mark: "?" },
];

const mobileNavItems = [
  {
    href: "/",
    label: "Today",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: "/chat",
    label: "Ask",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    href: "/reminders",
    label: "Reminders",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    href: "/expenses",
    label: "Spending",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M12 1v22" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    href: "/confirmations",
    label: "Review",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  const isPublicMarketing = pathname === "/offer";

  if (isLogin || isPublicMarketing) {
    return <main className="min-h-screen p-4 md:p-8">{children}</main>;
  }

  return (
    <div className="nc-shell">
      <header className="nc-mobile-topbar">
        <a href="/" className="flex items-center gap-3">
          <span className="nc-brand-mark">N</span>
          <span>
            <span className="block text-sm font-semibold text-slate-100">NitsyClaw</span>
            <span className="block text-xs text-slate-500">Home admin</span>
          </span>
        </a>
        <a href="/chat" aria-label="Open Chat" className="nc-button-primary min-h-9 px-3 text-xs">Ask</a>
      </header>

      <aside className="nc-sidebar">
        <div className="mb-5">
          <a href="/" className="flex items-center gap-3">
            <span className="nc-brand-mark">N</span>
            <span>
              <span className="block text-lg font-semibold tracking-normal text-slate-100">NitsyClaw</span>
              <span className="mt-0.5 block text-xs text-slate-500">Personal life admin</span>
            </span>
          </a>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a href="/chat" aria-label="Open Chat" className="nc-button-primary">Ask</a>
            <a href="/confirmations" className="nc-button">Review</a>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto text-sm">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-normal text-slate-500">
                {group.label}
              </div>
              <div className="grid grid-cols-1 gap-1">
                {group.items.map((item) => {
                  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={
                        "nc-nav-link " + (active ? "nc-nav-link-active" : "nc-nav-link-idle")
                      }
                    >
                      <span className={active ? "w-10 text-[10px] font-semibold text-[#d8b75d]" : "w-10 text-[10px] font-semibold text-slate-500"}>{item.mark}</span>
                      <span className="truncate">{item.label}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          ))}

          <details className="rounded-xl border border-stone-200 bg-white/45 p-2">
            <summary className="cursor-pointer list-none px-2 py-2 text-[11px] font-semibold uppercase tracking-normal text-stone-500">
              Owner tools
              <span className="mt-1 block normal-case text-stone-500">Not part of the customer demo.</span>
            </summary>
            <div className="mt-2 grid grid-cols-1 gap-1">
              {ownerToolItems.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={
                      "nc-nav-link " + (active ? "nc-nav-link-active" : "nc-nav-link-idle")
                    }
                  >
                    <span className={active ? "w-10 text-[10px] font-semibold text-[#d8b75d]" : "w-10 text-[10px] font-semibold text-slate-500"}>{item.mark}</span>
                    <span className="truncate">{item.label}</span>
                  </a>
                );
              })}
            </div>
          </details>

          <form action="/api/auth/logout" method="post" className="border-t border-slate-800 pt-4">
            <button className="text-left text-sm text-slate-400 transition-colors hover:text-slate-100" type="submit">
              Sign out
            </button>
          </form>
          <div className="flex gap-4 text-xs text-slate-500">
            <a href="/privacy" className="hover:text-slate-100">Privacy</a>
            <a href="/terms" className="hover:text-slate-100">Terms</a>
          </div>
        </nav>
      </aside>

      <main className="nc-main">{children}</main>

      <nav className="nc-mobile-nav">
        {mobileNavItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                "flex flex-1 flex-col items-center gap-1 py-3 text-[10px] font-medium transition-colors " +
                (active ? "text-[#d8b75d]" : "text-slate-500 hover:text-slate-100")
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
