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
            <h2 className="mt-3 max-w-xl text-4xl font-semibold leading-tight md:text-5xl">Personal life admin</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-stone-600 md:text-base">
              A private home base for messages, reminders, spending, decisions, and the things that should not be forgotten.
            </p>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl border border-stone-200 bg-[#fbf8f2] p-3">
              <div className="text-xs font-semibold text-[#8e3f24]">Private</div>
              <div className="mt-2 text-stone-900">Owner-gated</div>
            </div>
            <div className="rounded-xl border border-stone-200 bg-[#fbf8f2] p-3">
              <div className="text-xs font-semibold text-[#8e3f24]">Saved</div>
              <div className="mt-2 text-stone-900">Private records</div>
            </div>
            <div className="rounded-xl border border-stone-200 bg-[#fbf8f2] p-3">
              <div className="text-xs font-semibold text-[#8e3f24]">Useful</div>
              <div className="mt-2 text-stone-900">Fast action</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-[#fbf8f2] p-5 shadow-[0_16px_40px_rgba(70,48,23,0.06)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-2xl font-semibold">Sign in</h3>
              <p className="mt-2 text-sm text-stone-600">Access is restricted to the dashboard owner.</p>
            </div>
            <div className="nc-pill border-[#246b52]/30 bg-white text-[#246b52]">Private</div>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
              {error === "locked"
                ? "Too many failed attempts. Try again later."
                : "Invalid dashboard credentials."}
            </div>
          ) : null}

          <form className="mt-5 space-y-4" action="/api/auth/login" method="post">
            <input type="hidden" name="next" value={next} />
            <label className="block text-sm">
              <span className="font-medium text-stone-700">User</span>
              <input
                className="nc-input mt-1 w-full"
                name="user"
                autoComplete="username"
                defaultValue="nitesh"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-stone-700">Password</span>
              <input
                className="nc-input mt-1 w-full"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <button className="nc-button-primary w-full" type="submit">
              Sign in
            </button>
          </form>
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-stone-500">
            <a href="/privacy" className="hover:text-stone-900">Privacy</a>
            <a href="/terms" className="hover:text-stone-900">Terms</a>
            <span>Protected dashboard</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function sanitizeNext(value: string | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
