# Nitesh Basudkar — Sales & Operations Fixer

A premium, high-converting one-page consulting website for **Nitesh Basudkar**,
a Melbourne-based Sales & Operations Fixer who helps Australian service, solar,
energy, trade, and founder-led businesses stop leaking revenue after the lead
comes in.

Built with **Next.js (App Router) + TypeScript + Tailwind CSS**. Mobile-first,
accessible, SEO-ready, and deployable to Vercel with zero configuration.

---

## Positioning

> **Stop losing revenue after the lead comes in.**
>
> Nitesh helps businesses tighten follow-up, clean up sales/admin handovers,
> improve compliance discipline, and build practical sales systems their teams
> actually use — using real commercial energy, solar, B2B sales and field
> execution experience as credibility, not as a niche fence.

No fake testimonials, logos, case studies, or guarantees. Every section answers
one question: **"Why should a busy owner contact Nitesh?"**

---

## Tech stack

| Layer      | Choice                                   |
| ---------- | ---------------------------------------- |
| Framework  | Next.js 15 (App Router, React 19)        |
| Language   | TypeScript (strict)                      |
| Styling    | Tailwind CSS 3.4                          |
| Fonts      | Inter via `next/font` (self-hosted)      |
| SEO        | Metadata API, JSON-LD, sitemap, robots   |
| Hosting    | Vercel (recommended) / any Node host     |

---

## Project structure

```
nitesh-site/
├── app/
│   ├── layout.tsx        # Metadata, fonts, JSON-LD, skip link
│   ├── page.tsx          # Composes all sections in order
│   ├── globals.css       # Tailwind layers + reusable component classes
│   ├── robots.ts         # robots.txt
│   └── sitemap.ts        # sitemap.xml
├── components/           # One file per page section
│   ├── Header.tsx        # Sticky nav (client component)
│   ├── Hero.tsx
│   ├── CredibilityStrip.tsx
│   ├── Leakage.tsx
│   ├── BigPromise.tsx
│   ├── WhatIFix.tsx
│   ├── Offers.tsx
│   ├── Method.tsx
│   ├── WhoIHelp.tsx
│   ├── About.tsx
│   ├── WhyThisMatters.tsx
│   ├── FinalCta.tsx
│   ├── Contact.tsx
│   ├── Footer.tsx
│   └── icons.tsx         # Inline SVG icon set (no icon dependency)
├── lib/
│   └── site.ts           # Single source of truth: contact details + nav
└── ...config files
```

All contact details and the prefilled email/WhatsApp deep links live in
`lib/site.ts`. Update them in one place.

---

## Getting started

Requires **Node.js 18.18+** (Node 20+ recommended).

```bash
# from inside the nitesh-site/ directory
npm install
npm run dev
```

Open <http://localhost:3000>.

### Available scripts

| Command          | What it does                          |
| ---------------- | ------------------------------------- |
| `npm run dev`    | Start the dev server                  |
| `npm run build`  | Production build                      |
| `npm run start`  | Serve the production build            |
| `npm run lint`   | Run ESLint (next/core-web-vitals)     |

---

## Deploy to Vercel

1. Push this folder to a Git repository (or set the **Root Directory** to
   `nitesh-site` if it lives inside a larger repo).
2. Import the project at [vercel.com/new](https://vercel.com/new).
3. Framework preset: **Next.js** (auto-detected). No env vars required.
4. Deploy.

For a custom domain, set `SITE.url` in `lib/site.ts` to the final domain so the
canonical URL, sitemap, and Open Graph tags are correct.

---

## Editing content

- **Contact info / links:** `lib/site.ts`
- **Copy for any section:** the matching file in `components/`
- **Colours, shadows, fonts:** `tailwind.config.ts`
- **Page title / meta description / JSON-LD:** `app/layout.tsx`

---

## Accessibility & quality notes

- Semantic landmarks (`header`, `main`, `section`, `footer`) and a skip link.
- All icons are `aria-hidden`; interactive elements have visible focus rings.
- Colour contrast meets WCAG AA on text against its background.
- Honours `prefers-reduced-motion`.
- No placeholder text, no fake data, no broken links.
