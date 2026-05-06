import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist } from "next/font/google";
import { DashboardShell } from "./dashboard-shell";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });

export const viewport: Viewport = {
  themeColor: "#fffaf2",
};

export const metadata: Metadata = {
  title: "NitsyClaw",
  description: "Personal life admin",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "NitsyClaw",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={geistSans.variable}>
      <body>
        <DashboardShell>{children}</DashboardShell>
      </body>
    </html>
  );
}
