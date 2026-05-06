"use client";

import { useFormStatus } from "react-dom";

export function LoginForm({ next }: { next: string }) {
  return (
    <form className="mt-5 space-y-4" action="/api/auth/login" method="post">
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm">
        <span className="font-medium text-stone-800">User</span>
        <input
          className="nc-input mt-1 w-full"
          name="user"
          autoComplete="username"
          defaultValue="nitesh"
          required
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-stone-800">Password</span>
        <input
          className="nc-input mt-1 w-full"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="nc-button-primary w-full" type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Signing in..." : "Sign in"}
    </button>
  );
}
