"use client";

import { useEffect, useState } from "react";
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
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!pending) {
      setSlow(false);
      return;
    }

    const timer = window.setTimeout(() => setSlow(true), 4000);
    return () => window.clearTimeout(timer);
  }, [pending]);

  return (
    <>
      <button className="nc-button-primary w-full" type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Checking access..." : "Sign in"}
      </button>
      {slow ? (
        <p className="text-xs leading-5 text-stone-600" role="status">
          Still checking the dashboard. If this sits here, refresh and try once more.
        </p>
      ) : null}
    </>
  );
}
