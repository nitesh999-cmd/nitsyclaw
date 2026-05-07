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
    console.error("[dashboard/error]", {
      name: error.name,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Error</div>
        <h2 className="mt-2 text-3xl font-semibold">Something went wrong</h2>
        <p className="mt-3 nc-muted">
          An unexpected error occurred. It has been logged automatically.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-slate-600">ref: {error.digest}</p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <button onClick={reset} className="nc-button-primary">
            Try again
          </button>
          <a href="/" className="nc-button">
            Go home
          </a>
        </div>
      </section>
    </div>
  );
}
