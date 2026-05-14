export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-24">
      <div className="max-w-2xl w-full">
        <p className="font-mono text-xs tracking-widest text-muted uppercase">
          Calgary, AB · Construction Equipment Rental
        </p>
        <h1 className="mt-4 font-display text-5xl sm:text-6xl font-bold tracking-tight text-ink">
          Big D&rsquo;s Rental Co.
        </h1>
        <p className="mt-6 text-lg text-ink/80 leading-relaxed">
          Book mini excavators, skid steers, and attachments online. Sign your
          rental agreement, pay, and pick a delivery time — all in one flow.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <a
            href="/book"
            className="inline-flex items-center justify-center rounded-full bg-accent px-6 py-3 text-paper font-medium hover:bg-accent-hover transition-colors"
          >
            Start a booking
          </a>
          <a
            href="#fleet"
            className="inline-flex items-center justify-center rounded-full border border-ink/15 px-6 py-3 text-ink font-medium hover:bg-ink/5 transition-colors"
          >
            See the fleet
          </a>
        </div>
        <p className="mt-12 font-mono text-xs text-muted">
          Phase 1 · Foundation deploy · {new Date().toISOString().slice(0, 10)}
        </p>
      </div>
    </main>
  );
}
