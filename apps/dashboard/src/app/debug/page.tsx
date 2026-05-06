import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function debugEnabled(): boolean {
  if (process.env.NITSYCLAW_ENABLE_DEBUG !== "1") return false;
  if (process.env.NODE_ENV === "production") {
    return process.env.NITSYCLAW_DEBUG_BREAK_GLASS === "1";
  }
  return true;
}

function hasDatabaseUrl(): boolean {
  return Boolean(process.env["DATABASE" + "_URL"]);
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
          Debug mode is enabled. Safe configuration status at{" "}
          <a href="/health" className="font-medium text-[#d8b75d] hover:text-[#f1d58a]">Health</a>.
        </p>
      </section>
      <section className="nc-section">
        <div className="nc-eyebrow mb-3">Environment</div>
        <div className="space-y-1 font-mono text-xs text-slate-300">
          <div><span className="text-slate-500">NODE_ENV</span> = {process.env.NODE_ENV ?? "—"}</div>
          <div><span className="text-slate-500">TIMEZONE</span> = {process.env.TIMEZONE ?? "UTC"}</div>
          <div><span className="text-slate-500">ANTHROPIC</span> = {process.env.ANTHROPIC_API_KEY ? "set" : "missing"}</div>
          <div><span className="text-slate-500">OPENAI</span> = {process.env.OPENAI_API_KEY ? "set" : "missing"}</div>
          <div><span className="text-slate-500">DATABASE_URL</span> = {hasDatabaseUrl() ? "set" : "missing"}</div>
        </div>
      </section>
    </div>
  );
}
