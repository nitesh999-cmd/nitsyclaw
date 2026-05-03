import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default function DebugPage() {
  if (process.env.NITSYCLAW_ENABLE_DEBUG !== "1") {
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
