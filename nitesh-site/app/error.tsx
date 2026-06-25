"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error in the console for debugging; no PII is logged.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink px-6 text-center text-white">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent-soft">
          Something broke
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          That&apos;s on us, not you.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-slate-300">
          An unexpected error occurred. Try again — and if it keeps happening,
          reach out and I&apos;ll sort it.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="btn-primary mt-8"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
