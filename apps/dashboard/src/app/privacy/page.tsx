export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 text-slate-300 md:p-8">
      <h1 className="text-3xl font-semibold">Privacy</h1>
      <section className="space-y-3 text-sm leading-6 text-slate-400">
        <h2 className="text-lg font-medium text-slate-100">What NitsyClaw stores</h2>
        <p>
          NitsyClaw stores conversation history, saved memories, reminders, expenses, approvals,
          integration status, feature requests, health records, and redacted security/audit records.
        </p>
      </section>
      <section className="space-y-3 text-sm leading-6 text-slate-400">
        <h2 className="text-lg font-medium text-slate-100">Provider accounts</h2>
        <p>
          Connected account tokens are encrypted before storage. Disconnect controls revoke provider
          access where the provider supports revocation, then remove the local token record.
        </p>
      </section>
      <section className="space-y-3 text-sm leading-6 text-slate-400">
        <h2 className="text-lg font-medium text-slate-100">What delete does</h2>
        <p>
          Delete controls remove local NitsyClaw records for the selected scope. Provider-side data
          remains with the provider unless their revoke/delete API confirms otherwise. For full deletion,
          connected providers are disconnected before local records are removed; if local deletion fails
          after a provider disconnect, reconnect that provider only after retrying cleanup.
        </p>
      </section>
      <section className="space-y-3 text-sm leading-6 text-slate-400">
        <h2 className="text-lg font-medium text-slate-100">Public sale status</h2>
        <p>
          NitsyClaw is still private-owner software until multi-user auth, tenant isolation,
          provider deletion, and legal/privacy copy are verified.
        </p>
      </section>
    </main>
  );
}
