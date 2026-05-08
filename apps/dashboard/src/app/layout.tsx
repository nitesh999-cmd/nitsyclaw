import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist } from "next/font/google";
import { DashboardShell } from "./dashboard-shell";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nitsyclaw.vercel.app";

export const viewport: Viewport = {
  themeColor: "#fbf6ec",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "NitsyClaw",
  title: {
    default: "NitsyClaw | Private Personal PA",
    template: "%s | NitsyClaw",
  },
  description: "Personal life admin with a private personal PA for reminders, messages, decisions, and spending.",
  manifest: "/manifest.json",
  keywords: [
    "personal assistant",
    "private PA",
    "life admin",
    "WhatsApp assistant",
    "reminders",
    "personal automation",
  ],
  openGraph: {
    title: "NitsyClaw | Private Personal PA",
    description: "Personal life admin with a calm private home base for reminders, messages, decisions, and spending.",
    url: siteUrl,
    siteName: "NitsyClaw",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "NitsyClaw | Private Personal PA",
    description: "A private personal PA for everyday life admin.",
  },
  robots: {
    index: false,
    follow: false,
  },
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
