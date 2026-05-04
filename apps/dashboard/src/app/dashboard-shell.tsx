"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  if (isLogin) {
    return <main className="min-h-screen p-8">{children}</main>;
  }

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-neutral-800 p-4 md:w-56 md:border-b-0 md:border-r">
        <h1 className="text-lg font-semibold mb-6">NitsyClaw</h1>
        <nav className="flex flex-wrap gap-3 text-sm md:flex-col md:gap-2">
          <a className="hover:underline" href="/">Today</a>
          <a className="hover:underline" href="/chat">Chat</a>
          <a className="hover:underline" href="/confirmations">Approvals</a>
          <a className="hover:underline" href="/settings">Data</a>
          <a className="hover:underline" href="/onboarding">Setup</a>
          <a className="hover:underline" href="/conversations">Conversations</a>
          <a className="hover:underline" href="/activity">Activity</a>
          <a className="hover:underline" href="/command">Command</a>
          <a className="hover:underline" href="/queue">Queue</a>
          <a className="hover:underline" href="/memory">Memory</a>
          <a className="hover:underline" href="/reminders">Reminders</a>
          <a className="hover:underline" href="/expenses">Expenses</a>
          <a className="hover:underline" href="/health">Health</a>
          <a className="hover:underline" href="/integrations">Integrations</a>
          <a className="hover:underline" href="/help">Help</a>
          <form action="/api/auth/logout" method="post" className="pt-4">
            <button className="text-left text-neutral-400 hover:text-neutral-100 hover:underline" type="submit">
              Sign out
            </button>
          </form>
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
