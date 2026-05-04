export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const error = params?.error;
  const next = sanitizeNext(params?.next);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center">
      <section className="nc-hero grid w-full gap-8 md:grid-cols-[1.2fr_0.8fr] md:p-8">
        <div className="flex flex-col justify-between gap-10">
          <div>
            <div className="nc-eyebrow">NitsyClaw</div>
            <h2 className="mt-3 text-4xl font-semibold">Personal AI control plane</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">
              Private dashboard for chat, WhatsApp memory, approvals, reminders, queue execution, and owner data controls.
            </p>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="nc-tile">Private by default</div>
            <div className="nc-tile">Audit-ready controls</div>
            <div className="nc-tile">Fast command access</div>
          </div>
        </div>

        <div>
          <h3 className="text-2xl font-semibold">Sign in</h3>
          <p className="mt-2 text-sm text-slate-400">Access is restricted to the dashboard owner.</p>

          {error ? (
            <div className="mt-4 border border-red-900 bg-red-950/40 p-3 text-sm text-red-200" role="alert">
              {error === "locked"
                ? "Too many failed attempts. Try again later."
                : "Invalid dashboard credentials."}
            </div>
          ) : null}

          <form className="mt-5 space-y-4" action="/api/auth/login" method="post">
            <input type="hidden" name="next" value={next} />
            <label className="block text-sm">
              <span className="text-slate-300">User</span>
              <input
                className="nc-input mt-1 w-full"
                name="user"
                autoComplete="username"
                defaultValue="nitesh"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-300">Password</span>
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
        </div>
      </section>
    </div>
  );
}

function sanitizeNext(value: string | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
