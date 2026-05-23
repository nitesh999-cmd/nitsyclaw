"use client";

import { FormEvent, useMemo, useState } from "react";

const waitlistEmail = process.env.NEXT_PUBLIC_WAITLIST_EMAIL || "hello@nitsyclaw.com";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function WaitlistInterestForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [useCase, setUseCase] = useState("");
  const [error, setError] = useState("");

  const mailBody = useMemo(() => {
    return [
      "Hi NitsyClaw,",
      "",
      "I want beta access.",
      "",
      `Name: ${name || "Not provided"}`,
      `Email: ${email || "Not provided"}`,
      `Main use case: ${useCase || "Not provided"}`,
      "",
      "I understand this is early beta access and real account integrations may need setup first.",
    ].join("\n");
  }, [email, name, useCase]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isValidEmail(email.trim())) {
      setError("Enter a valid email so beta access can be followed up.");
      return;
    }

    setError("");
    const href = [
      `mailto:${waitlistEmail}`,
      `?subject=${encodeURIComponent("NitsyClaw beta access request")}`,
      `&body=${encodeURIComponent(mailBody)}`,
    ].join("");
    window.location.href = href;
  }

  return (
    <form onSubmit={onSubmit} className="rounded-3xl border border-stone-300 bg-[#fffdf8] p-5 shadow-[0_18px_48px_rgba(70,48,23,0.09)] md:p-6">
      <div className="nc-eyebrow">Private beta</div>
      <h3 className="mt-2 text-2xl font-semibold">Request beta access</h3>
      <p className="mt-2 text-sm leading-6 text-stone-700">
        This opens an email draft. No payment. No account is created yet. It is the safest way to capture real
        interest while provider setup and tenant isolation are still being hardened.
      </p>

      <div className="mt-5 grid gap-3">
        <label className="grid gap-1 text-sm font-semibold text-stone-800">
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-h-11 rounded-xl border border-stone-300 bg-white px-3 text-base font-normal outline-none focus:border-[#8e3f24]"
            autoComplete="name"
            maxLength={80}
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-stone-800">
          Email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="min-h-11 rounded-xl border border-stone-300 bg-white px-3 text-base font-normal outline-none focus:border-[#8e3f24]"
            autoComplete="email"
            inputMode="email"
            maxLength={120}
            required
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-stone-800">
          Main thing you want this to handle
          <textarea
            value={useCase}
            onChange={(event) => setUseCase(event.target.value)}
            className="min-h-24 rounded-xl border border-stone-300 bg-white px-3 py-2 text-base font-normal outline-none focus:border-[#8e3f24]"
            maxLength={500}
          />
        </label>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          {error}
        </p>
      ) : null}

      <button type="submit" className="nc-button-primary mt-5 w-full justify-center">
        Request beta access
      </button>
    </form>
  );
}
