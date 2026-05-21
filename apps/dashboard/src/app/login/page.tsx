import { LoginForm } from "./login-form";

const DEFAULT_LOGIN_NEXT = "/onboarding";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const error = params?.error;
  const next = sanitizeNext(params?.next);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl items-center">
      <section className="nc-hero grid w-full gap-8 md:grid-cols-[1.05fr_0.95fr] md:p-8">
        <div className="flex flex-col justify-between gap-10">
          <div>
            <div className="nc-eyebrow">NitsyClaw</div>
            <h1 className="mt-3 max-w-xl text-4xl font-semibold leading-tight md:text-5xl">Your private personal PA</h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400 md:text-base">
              A calm home base for reminders, messages, spending, decisions, and the things that should not be forgotten.
            </p>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="nc-tile p-3">
              <div className="nc-eyebrow">Private</div>
              <div className="mt-2 text-slate-200">Owner-gated</div>
            </div>
            <div className="nc-tile p-3">
              <div className="nc-eyebrow">Saved</div>
              <div className="mt-2 text-slate-200">Private records</div>
            </div>
            <div className="nc-tile p-3">
              <div className="nc-eyebrow">Safe</div>
              <div className="mt-2 text-slate-200">Approval first</div>
            </div>
          </div>
        </div>

        <div className="nc-glass-panel order-first p-5 md:order-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-2xl font-semibold text-slate-100">Sign in</h3>
              <p className="mt-2 text-sm text-slate-400">Access is restricted to the dashboard owner.</p>
            </div>
            <div className="nc-pill border-[#d8b75d]/30 text-[#d8b75d]">Private</div>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-200" role="alert">
              {error === "locked"
                ? "Too many failed attempts. Try again later."
                : "Invalid dashboard credentials."}
            </div>
          ) : null}

          <LoginForm next={next} />
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
            <a href="/privacy" className="hover:text-slate-100">Privacy</a>
            <a href="/terms" className="hover:text-slate-100">Terms</a>
            <span>Protected dashboard</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function sanitizeNext(value: string | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return DEFAULT_LOGIN_NEXT;
  return value;
}
