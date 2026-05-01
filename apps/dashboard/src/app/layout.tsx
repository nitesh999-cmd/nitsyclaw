import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "NitsyClaw", description: "Personal AI control plane" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <div className="min-h-screen flex">
          <aside className="w-56 border-r border-neutral-800 p-4">
            <h1 className="text-lg font-semibold mb-6">NitsyClaw</h1>
            <nav className="flex flex-col gap-2 text-sm">
              <a className="hover:underline" href="/">Today</a>
              <a className="hover:underline" href="/chat">Chat</a>
              <a className="hover:underline" href="/conversations">Conversations</a>
              <a className="hover:underline" href="/memory">Memory</a>
              <a className="hover:underline" href="/reminders">Reminders</a>
              <a className="hover:underline" href="/expenses">Expenses</a>
              <a className="hover:underline" href="/integrations">Integrations</a>
              <a className="hover:underline" href="/settings">Settings</a>
            </nav>
          </aside>
          <main className="flex-1 p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
