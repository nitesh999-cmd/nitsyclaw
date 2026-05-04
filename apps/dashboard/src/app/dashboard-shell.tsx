"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navGroups = [
  {
    label: "Core",
    items: [
      { href: "/", label: "Today", mark: "01" },
      { href: "/chat", label: "Chat", mark: "02" },
      { href: "/command", label: "Command", mark: "03" },
      { href: "/confirmations", label: "Approvals", mark: "04" },
    ],
  },
  {
    label: "Memory",
    items: [
      { href: "/queue", label: "Queue", mark: "05" },
      { href: "/conversations", label: "Conversations", mark: "06" },
      { href: "/memory", label: "Memory", mark: "07" },
      { href: "/reminders", label: "Reminders", mark: "08" },
      { href: "/expenses", label: "Expenses", mark: "09" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/health", label: "Health", mark: "10" },
      { href: "/integrations", label: "Integrations", mark: "11" },
      { href: "/settings", label: "Data", mark: "12" },
      { href: "/onboarding", label: "Setup", mark: "13" },
      { href: "/activity", label: "Activity", mark: "14" },
      { href: "/help", label: "Help", mark: "15" },
    ],
  },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  if (isLogin) {
    return <main className="min-h-screen p-4 md:p-8">{children}</main>;
  }

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-slate-800 bg-slate-950/75 p-4 backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-b-0 lg:border-r">
        <div className="mb-5 flex items-center justify-between gap-3 lg:block">
          <a href="/" className="block">
            <div className="text-xl font-semibold tracking-normal text-white">NitsyClaw</div>
            <div className="mt-1 text-xs text-slate-500">Personal AI control plane</div>
          </a>
          <a href="/chat" className="nc-button-primary lg:mt-4">Open Chat</a>
        </div>

        <nav className="space-y-5 text-sm">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {group.label}
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-1">
                {group.items.map((item) => {
                  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={
                        "flex min-h-10 items-center gap-3 border px-3 py-2 transition-colors " +
                        (active
                          ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100"
                          : "border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-900 hover:text-slate-100")
                      }
                    >
                      <span className="w-6 text-[10px] font-semibold text-slate-600">{item.mark}</span>
                      <span>{item.label}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          ))}

          <form action="/api/auth/logout" method="post" className="border-t border-slate-800 pt-4">
            <button className="text-left text-sm text-slate-500 transition-colors hover:text-slate-100" type="submit">
              Sign out
            </button>
          </form>
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-6 xl:p-8">{children}</main>
    </div>
  );
}
