import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { SITE } from "@/lib/site";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const description =
  "Nitesh Basudkar helps Australian service, solar, energy, trade, and founder-led businesses tighten follow-up, fix operational leaks, improve compliance discipline, and build practical sales systems.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "Nitesh Basudkar | Sales & Operations Fixer",
    template: "%s | Nitesh Basudkar",
  },
  description,
  keywords: [
    "Sales and operations consultant Australia",
    "follow-up systems",
    "quote chasing process",
    "sales operations Melbourne",
    "solar energy sales process",
    "compliance process discipline",
    "founder-led business systems",
    "Nitesh Basudkar",
  ],
  authors: [{ name: SITE.name }],
  creator: SITE.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_AU",
    url: SITE.url,
    siteName: SITE.name,
    title: "Nitesh Basudkar | Sales & Operations Fixer",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Nitesh Basudkar | Sales & Operations Fixer",
    description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1120",
  width: "device-width",
  initialScale: 1,
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: `${SITE.name} — ${SITE.role}`,
  description,
  email: SITE.email,
  telephone: SITE.phone,
  url: SITE.url,
  areaServed: "AU",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Melbourne",
    addressRegion: "VIC",
    addressCountry: "AU",
  },
  sameAs: [SITE.linkedin],
  provider: { "@type": "Person", name: SITE.name },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-AU" className={inter.variable}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
