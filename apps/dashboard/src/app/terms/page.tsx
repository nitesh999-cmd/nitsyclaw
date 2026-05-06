export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 text-stone-800 md:p-8">
      <h1 className="text-3xl font-semibold">Private beta terms</h1>
      <section className="space-y-3 text-sm leading-6 text-stone-700">
        <h2 className="text-lg font-medium text-stone-950">Use</h2>
        <p>
          NitsyClaw is a personal admin assistant for drafting, remembering, organizing, and
          preparing everyday tasks. Important actions should stay approval-gated.
        </p>
      </section>
      <section className="space-y-3 text-sm leading-6 text-stone-700">
        <h2 className="text-lg font-medium text-stone-950">Limits</h2>
        <p>
          Not financial, legal, medical, or emergency advice. Users are responsible for checking
          important messages, bookings, purchases, and decisions before relying on them.
        </p>
      </section>
      <section className="space-y-3 text-sm leading-6 text-stone-700">
        <h2 className="text-lg font-medium text-stone-950">Availability</h2>
        <p>
          During private beta, integrations may fail, provider APIs may change, and WhatsApp access
          depends on the local phone/session staying connected.
        </p>
      </section>
      <section className="space-y-3 text-sm leading-6 text-stone-700">
        <h2 className="text-lg font-medium text-stone-950">Public sale status</h2>
        <p>
          The product is not ready for public sale until the launch-readiness gate reports ready.
        </p>
      </section>
    </main>
  );
}
