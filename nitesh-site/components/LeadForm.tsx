"use client";

import { useState } from "react";
import { Mail, WhatsApp } from "./icons";
import { whatsAppLink, mailtoLink } from "@/lib/site";

// No-backend lead capture: builds a pre-filled WhatsApp message (AU is
// messaging-first) with an email fallback. Works on any static host with
// zero config. To switch to stored leads later, POST these fields to a
// service like Web3Forms/Formspree instead of opening the deep links.
export default function LeadForm() {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [problem, setProblem] = useState("");

  const compose = () =>
    [
      "Hi Nitesh, I'd like a hand fixing where my business is leaking.",
      "",
      name && `Name: ${name}`,
      contact && `Best contact: ${contact}`,
      problem && `Main thing slowing us down: ${problem}`,
    ]
      .filter(Boolean)
      .join("\n");

  const onWhatsApp = (e: React.FormEvent) => {
    e.preventDefault();
    window.open(whatsAppLink(compose()), "_blank", "noopener,noreferrer");
  };

  const emailHref = mailtoLink(
    "Where my business is leaking revenue",
    compose(),
  );

  return (
    <form onSubmit={onWhatsApp} className="card border-t-4 border-t-accent-strong p-6 sm:p-7">
      <p className="text-base font-semibold text-ink">
        Tell me what&apos;s slowing you down
      </p>
      <p className="mt-1 text-sm text-slate-500">
        Three quick fields. Tap send and WhatsApp opens with your message ready
        — just hit send. Prefer email? Use the button on the right.
      </p>

      <div className="mt-5 space-y-3">
        <div>
          <label htmlFor="lf-name" className="sr-only">
            Your name
          </label>
          <input
            id="lf-name"
            className="field"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </div>
        <div>
          <label htmlFor="lf-contact" className="sr-only">
            Mobile or email
          </label>
          <input
            id="lf-contact"
            className="field"
            placeholder="Mobile or email"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="lf-problem" className="sr-only">
            What is the main thing slowing you down?
          </label>
          <textarea
            id="lf-problem"
            className="field min-h-[88px] resize-y"
            placeholder="What's the main thing slowing you down? (e.g. quotes not chased, leads going cold)"
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          className="btn h-12 flex-1 bg-[#25D366] text-ink shadow-card hover:brightness-95"
        >
          <WhatsApp className="h-4 w-4" />
          Send on WhatsApp
        </button>
        <a href={emailHref} className="btn-secondary h-12 flex-1">
          <Mail className="h-4 w-4" />
          Send by email
        </a>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        No spam, no list. Goes straight to me, and I usually reply the same day.
      </p>
    </form>
  );
}
