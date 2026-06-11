"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Standalone signing widget reached from the admin's "Email signature
// link" notification. Mirrors the Step 4 StepSign component from the
// booking flow but renders without the multi-step chrome.
export function SignPad({ bookingId }: { bookingId: string }) {
  const [signUrl, setSignUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"loading" | "open" | "finalizing" | "done">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bookings/${bookingId}/start-signature`, { method: "POST" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.sign_url) {
          setError(json.error ?? "Failed to start signing");
          return;
        }
        setSignUrl(json.sign_url);
        setPhase("open");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to start signing");
      }
    })();
    return () => { cancelled = true; };
  }, [bookingId]);

  useEffect(() => {
    function handle(evt: MessageEvent) {
      if (!evt.data || typeof evt.data !== "object") return;
      const data = evt.data as { type?: string; bookingId?: string };
      if (data.type !== "bigds:boldsign:signed" || data.bookingId !== bookingId) return;
      setPhase("finalizing");
      (async () => {
        try {
          let lastErr = "Failed to confirm signature";
          for (let i = 0; i < 5; i++) {
            const res = await fetch(`/api/bookings/${bookingId}/finalize-signature`, { method: "POST" });
            if (res.ok) {
              setPhase("done");
              return;
            }
            const json = await res.json().catch(() => ({}));
            lastErr = json.error ?? lastErr;
            await new Promise((r) => setTimeout(r, 1000));
          }
          setError(lastErr);
          setPhase("open");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to confirm signature");
          setPhase("open");
        }
      })();
    }
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, [bookingId]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Review the agreement carefully, sign at the bottom, and submit.
      </p>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      )}
      {phase === "loading" && (
        <div className="rounded-lg border border-ink/15 bg-paper px-4 py-3 text-sm text-muted">
          Preparing your agreement…
        </div>
      )}
      {phase === "open" && signUrl && !error && (
        <div className="rounded-lg border border-ink/15 bg-paper overflow-hidden">
          <iframe
            src={signUrl}
            className="w-full"
            style={{ height: "85vh", minHeight: "640px" }}
            allow="camera"
            title="Sign rental agreement"
          />
        </div>
      )}
      {phase === "finalizing" && (
        <div className="rounded-lg border border-ink/15 bg-paper px-4 py-3 text-sm text-muted">
          Verifying signature…
        </div>
      )}
      {phase === "done" && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-6 py-6">
          <p className="font-medium text-emerald-900">
            ✓ Signature received. Your booking is now fully confirmed.
          </p>
          <p className="mt-2 text-sm text-emerald-900/80">
            A signed copy of the agreement has been emailed to you.
          </p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-full bg-accent px-6 py-3 text-paper font-medium hover:bg-accent-hover transition-colors"
          >
            ← Back to home
          </Link>
        </div>
      )}
    </div>
  );
}
