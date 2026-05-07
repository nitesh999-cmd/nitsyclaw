import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function debugEnabled(): boolean {
  if (process.env.NITSYCLAW_ENABLE_DEBUG !== "1") return false;
  return process.env.NODE_ENV !== "production";
}

export default function DebugPage() {
  if (!debugEnabled()) {
    notFound();
  }

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Developer</div>
        <h2 className="mt-2 text-3xl font-semibold">Runtime Diagnostics</h2>
        <p className="mt-3 text-sm text-slate-400">
          Debug mode is enabled for local development only. Safe configuration status at{" "}
          <a href="/health" className="font-medium text-[#d8b75d] hover:text-[#f1d58a]">Health</a>.
        </p>
      </section>
      <section className="nc-section">
        <div className="nc-eyebrow mb-3">Safe diagnostics</div>
        <p className="text-sm text-slate-300">
          This page intentionally avoids listing environment variables. Use the health page for
          safe readiness status.
        </p>
      </section>
    </div>
  );
}
