import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink px-6 text-center text-white">
      <div
        className="pointer-events-none absolute -left-32 top-[-10%] h-96 w-96 rounded-full bg-accent/20 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent-soft">
          404
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          That page sprang a leak.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-slate-300">
          The page you&apos;re after doesn&apos;t exist. Let&apos;s get you back
          to where the fixing happens.
        </p>
        <Link href="/" className="btn-primary mt-8">
          Back to home
        </Link>
      </div>
    </main>
  );
}
