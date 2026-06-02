"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, WhatsApp } from "./icons";
import { whatsAppLink, mailtoLink } from "@/lib/site";

const LEAKS = [
  "Leads not followed up fast enough",
  "Quotes sent but not chased properly",
  "Customer objections not captured or reused",
  "Sales and admin handovers breaking down",
  "Compliance steps handled too late",
  "Owner stuck doing everything",
  "Too many tools, not enough process",
  "No clear operating rhythm",
];

type Tier = {
  headline: string;
  body: string;
  tone: string;
};

function tierFor(count: number): Tier {
  if (count === 0) {
    return {
      headline: "Tighter than most — worth a quick sense-check",
      body: "Nothing ticked is rare. Either you're running a clean ship, or a couple of leaks are hiding. A 20-minute call will confirm which.",
      tone: "from-slate-700 to-slate-900",
    };
  }
  if (count <= 2) {
    return {
      headline: `${count} leak${count > 1 ? "s" : ""} — quick wins on the table`,
      body: "A couple of small leaks. The 90-minute audit or the 7-day follow-up fix is your fastest, lowest-cost path to plugging them.",
      tone: "from-emerald-700 to-teal-800",
    };
  }
  if (count <= 4) {
    return {
      headline: `${count} leaks — money is slipping weekly`,
      body: "Several leaks compounding. This is exactly where a focused fix pays for itself fast — start with the audit so we rank them by impact.",
      tone: "from-amber-700 to-orange-800",
    };
  }
  return {
    headline: `${count} leaks — stacking up every week`,
    body: "Multiple leaks compounding across the business. Worth starting now — the 30-day Sales-to-Delivery Operating System is built for exactly this.",
    tone: "from-rose-600 to-red-700",
  };
}

export default function LeakScorecard() {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
      } else {
        next.add(i);
      }
      return next;
    });

  const count = selected.size;
  const tier = useMemo(() => tierFor(count), [count]);

  const { waHref, emailHref } = useMemo(() => {
    const picked = LEAKS.filter((_, i) => selected.has(i));
    const lines = picked.length
      ? ["The leaks I ticked:", ...picked.map((l) => `• ${l}`)]
      : ["I'm not sure where we're leaking yet — can you help me find out?"];
    const message = [
      "Hi Nitesh, I just ran the leak scan on your site.",
      "",
      ...lines,
      "",
      "Can you tell me what to fix first?",
    ].join("\n");
    return {
      waHref: whatsAppLink(message),
      emailHref: mailtoLink("My leak scan results", message),
    };
  }, [selected]);

  return (
    <section id="scorecard" className="reveal bg-slate-50 py-20 sm:py-24">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">2-minute leak scan</span>
          <h2 className="section-title mt-4">
            Where is your business leaking right now?
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            Tick every one that sounds like your business. You&apos;ll get an
            honest read on how much is slipping — and exactly where to start. No
            email required.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-4xl">
          <fieldset>
            <legend className="sr-only">
              Select the revenue leaks that apply to your business
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {LEAKS.map((leak, i) => {
                const on = selected.has(i);
                return (
                  <label
                    key={leak}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border bg-white px-4 py-3.5 text-sm font-medium transition ${
                      on
                        ? "border-accent-strong bg-accent-strong/[0.06] text-ink"
                        : "border-slate-200 text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={on}
                      onChange={() => toggle(i)}
                    />
                    <span
                      aria-hidden="true"
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition peer-focus-visible:ring-2 peer-focus-visible:ring-accent-strong peer-focus-visible:ring-offset-2 ${
                        on
                          ? "border-accent-strong bg-accent-strong text-white"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {on && <Check className="h-3.5 w-3.5" />}
                    </span>
                    {leak}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* result */}
          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 shadow-card">
            <div className={`bg-gradient-to-r ${tier.tone} px-6 py-6 text-white`}>
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-2xl font-bold backdrop-blur">
                  {count}
                  <span className="text-sm font-medium opacity-70">/8</span>
                </div>
                {/* only the dynamic text is a live region, and CTAs sit outside it */}
                <div aria-live="polite" aria-atomic="true">
                  <p className="text-lg font-bold leading-tight">
                    {tier.headline}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-white">
                    {tier.body}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 bg-white px-6 py-5 sm:flex-row">
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="btn h-12 flex-1 bg-[#25D366] text-ink shadow-card hover:brightness-95"
              >
                <WhatsApp className="h-4 w-4" />
                Send my scan on WhatsApp
              </a>
              <a href="#offers" className="btn-secondary h-12 flex-1">
                See ways to start
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-slate-500">
            Prefer email?{" "}
            <a href={emailHref} className="font-medium text-accent-strong underline">
              Send your scan by email
            </a>
            . This is a self-check, not a diagnosis — the call is where we
            confirm what&apos;s really going on.
          </p>
        </div>
      </div>
    </section>
  );
}
