export default function NotFound() {
  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">404</div>
        <h2 className="mt-2 text-3xl font-semibold">Page not found</h2>
        <p className="mt-3 nc-muted">
          This page does not exist or has been moved.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="/" className="nc-button-primary">
            Go home
          </a>
          <a href="/chat" className="nc-button">
            Open chat
          </a>
        </div>
      </section>
    </div>
  );
}
