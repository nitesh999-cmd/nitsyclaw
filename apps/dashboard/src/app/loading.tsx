const PULSE = "animate-pulse rounded-lg bg-stone-300/70";

export default function Loading() {
  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className={`h-3 w-16 ${PULSE}`} />
        <div className={`mt-3 h-9 max-w-xl ${PULSE}`} />
        <div className={`mt-4 h-4 max-w-2xl ${PULSE}`} />
        <div className={`mt-2 h-4 max-w-lg ${PULSE}`} />
        <div className="mt-5 flex gap-3">
          <div className={`h-10 w-28 ${PULSE}`} />
          <div className={`h-10 w-28 ${PULSE}`} />
        </div>
      </section>
      <section className="grid gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="nc-tile">
            <div className={`h-3 w-20 ${PULSE}`} />
            <div className={`mt-4 h-8 w-14 ${PULSE}`} />
            <div className={`mt-3 h-3 w-24 ${PULSE}`} />
          </div>
        ))}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="nc-section space-y-3">
          <div className={`h-3 w-24 ${PULSE}`} />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`h-4 w-full ${PULSE}`} />
          ))}
        </div>
        <div className="nc-section space-y-3">
          <div className={`h-3 w-16 ${PULSE}`} />
          <div className={`h-20 w-full ${PULSE}`} />
          <div className="flex gap-2">
            <div className={`h-10 flex-1 ${PULSE}`} />
            <div className={`h-10 flex-1 ${PULSE}`} />
          </div>
        </div>
      </section>
    </div>
  );
}
