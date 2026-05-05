"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navGroups = [
  {
    label: "Do now",
    items: [
      { href: "/", label: "Today", mark: "01" },
      { href: "/chat", label: "Chat", mark: "02" },
      { href: "/command", label: "Command", mark: "03" },
      { href: "/confirmations", label: "Approvals", mark: "04" },
    ],
  },
  {
    label: "Keep track",
    items: [
      { href: "/reminders", label: "Reminders", mark: "05" },
      { href: "/expenses", label: "Expenses", mark: "06" },
      { href: "/memory", label: "Memory", mark: "07" },
      { href: "/conversations", label: "Conversations", mark: "08" },
      { href: "/queue", label: "Queue", mark: "09" },
    ],
  },
  {
    label: "Trust",
    items: [
      { href: "/health", label: "Health", mark: "10" },
      { href: "/integrations", label: "Integrations", mark: "11" },
      { href: "/settings", label: "Data controls", mark: "12" },
      { href: "/onboarding", label: "Setup", mark: "13" },
      { href: "/activity", label: "Activity", mark: "14" },
      { href: "/help", label: "Help", mark: "15" },
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
    label: "Chat",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    href: "/command",
    label: "Command",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M4 17l6-6-6-6" />
        <path d="M12 19h8" />
      </svg>
    ),
  },
  {
    href: "/reminders",
    label: "Reminders",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
  {
    href: "/queue",
    label: "Queue",
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
            <span className="block text-sm font-semibold text-white">NitsyClaw</span>
            <span className="block text-xs text-slate-500">Life admin</span>
          </span>
        </a>
        <a href="/chat" aria-label="Open Chat" className="nc-button-primary min-h-9 px-3 text-xs">Chat</a>
      </header>

      <aside className="nc-sidebar">
        <div className="mb-5">
          <a href="/" className="flex items-center gap-3">
            <span className="nc-brand-mark">N</span>
            <span>
              <span className="block text-lg font-semibold tracking-normal text-white">NitsyClaw</span>
              <span className="mt-0.5 block text-xs text-slate-500">Personal life admin</span>
            </span>
          </a>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a href="/chat" aria-label="Open Chat" className="nc-button-primary">Chat</a>
            <a href="/command" className="nc-button">Command</a>
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
                      <span className={active ? "w-6 text-[10px] font-semibold text-[#d8b75d]" : "w-6 text-[10px] font-semibold text-slate-600"}>{item.mark}</span>
                      <span className="truncate">{item.label}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          ))}

          <form action="/api/auth/logout" method="post" className="border-t border-white/10 pt-4">
            <button className="text-left text-sm text-slate-500 transition-colors hover:text-slate-100" type="submit">
              Sign out
            </button>
          </form>
          <div className="flex gap-4 text-xs text-slate-600">
            <a href="/privacy" className="hover:text-slate-300">Privacy</a>
            <a href="/terms" className="hover:text-slate-300">Terms</a>
          </div>
        </nav>
      </aside>

      <main className="flex-1 p-4 pb-24 md:p-6 lg:pb-8 xl:p-8">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-white/10 bg-[#090b0e]/95 backdrop-blur-xl lg:hidden">
        {mobileNavItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                "flex flex-1 flex-col items-center gap-1 py-3 text-[10px] font-medium transition-colors " +
                (active ? "text-[#f1d58a]" : "text-slate-500 hover:text-slate-300")
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
