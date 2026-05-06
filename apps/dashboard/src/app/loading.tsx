export default function Loading() {
  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Loading</div>
        <div className="mt-3 h-10 max-w-xl rounded-xl bg-stone-200" />
        <div className="mt-4 h-4 max-w-2xl rounded-full bg-stone-200" />
        <div className="mt-2 h-4 max-w-lg rounded-full bg-stone-200" />
      </section>
      <section className="grid gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="nc-tile">
            <div className="h-3 w-20 rounded-full bg-stone-200" />
            <div className="mt-4 h-8 w-14 rounded-xl bg-stone-200" />
            <div className="mt-3 h-3 w-24 rounded-full bg-stone-200" />
          </div>
        ))}
      </section>
    </div>
  );
}
