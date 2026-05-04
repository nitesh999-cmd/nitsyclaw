import "./globals.css";
import type { ReactNode } from "react";
import { DashboardShell } from "./dashboard-shell";

export const metadata = { title: "NitsyClaw", description: "Personal AI control plane" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <DashboardShell>{children}</DashboardShell>
      </body>
    </html>
  );
}
