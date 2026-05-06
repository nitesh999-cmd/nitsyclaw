import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function debugEnabled(): boolean {
  if (process.env.NITSYCLAW_ENABLE_DEBUG !== "1") return false;
  if (process.env.NODE_ENV === "production") {
    return process.env.NITSYCLAW_DEBUG_BREAK_GLASS === "1";
  }
  return true;
}

export default function DebugPage() {
  if (!debugEnabled()) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Runtime Diagnostics</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Debug mode is enabled. Use the Health page for safe configuration status.
        </p>
      </div>
    </div>
  );
}
