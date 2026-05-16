"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navGroups = [
  {
    label: "Use every day",
    items: [
      { href: "/", label: "Today", mark: "Home" },
      { href: "/chat", label: "Ask", mark: "Talk" },
      { href: "/confirmations", label: "Review", mark: "Yes" },
      { href: "/memory", label: "Remember", mark: "Keep" },
      { href: "/settings", label: "Settings", mark: "Safe" },
    ],
  },
  {
    label: "Life admin",
    items: [
      { href: "/reminders", label: "Reminders", mark: "Soon" },
      { href: "/expenses", label: "Spending", mark: "$" },
      { href: "/conversations", label: "Messages", mark: "Log" },
      { href: "/queue", label: "Requests", mark: "Next" },
    ],
  },
  {
    label: "Advanced",
    items: [
      { href: "/command", label: "Work desk", mark: "Admin" },
      { href: "/health", label: "Health", mark: "OK" },
      { href: "/whatsapp-recovery", label: "WA recovery", mark: "WA" },
      { href: "/activity", label: "Activity", mark: "Now" },
      { href: "/search", label: "Search", mark: "Find" },
      { href: "/stats", label: "Stats", mark: "Data" },
      { href: "/profile", label: "Profile", mark: "Me" },
      { href: "/integrations", label: "Connections", mark: "Link" },
      { href: "/onboarding", label: "Setup", mark: "Start" },
      { href: "/help", label: "Help", mark: "?" },
    ],
  },
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
    href: "/confirmations",
    label: "Review",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    href: "/memory",
    label: "Remember",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    href: "/queue",
    label: "Requests",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M8 6h13" />
        <path d="M8 12h13" />
        <path d="M8 18h13" />
        <path d="M3 6h.01" />
        <path d="M3 12h.01" />
        <path d="M3 18h.01" />
      </svg>
    ),
  },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  if (isLogin) {
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
