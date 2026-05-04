export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const error = params?.error;
  const next = sanitizeNext(params?.next);

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Sign in</h2>
        <p className="mt-2 text-sm text-neutral-400">Access is restricted to the dashboard owner.</p>
      </div>

      {error ? (
        <div className="border border-red-900 bg-red-950/40 p-3 text-sm text-red-200" role="alert">
          {error === "locked"
            ? "Too many failed attempts. Try again later."
            : "Invalid dashboard credentials."}
        </div>
      ) : null}

      <form className="space-y-4" action="/api/auth/login" method="post">
        <input type="hidden" name="next" value={next} />
        <label className="block text-sm">
          <span className="text-neutral-300">User</span>
          <input
            className="mt-1 w-full border border-neutral-800 bg-neutral-950 px-3 py-2 text-neutral-100"
            name="user"
            autoComplete="username"
            defaultValue="nitesh"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-300">Password</span>
          <input
            className="mt-1 w-full border border-neutral-800 bg-neutral-950 px-3 py-2 text-neutral-100"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <button className="w-full bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-950" type="submit">
          Sign in
        </button>
      </form>
    </div>
  );
}

function sanitizeNext(value: string | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
