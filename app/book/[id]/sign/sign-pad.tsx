"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Standalone signing widget used when the admin re-sends a signature
// link to the customer. Mirrors the Step 4 StepSign component from the
// booking flow, but without the back/next button — this is reached
// from an email link, not the multi-step form.
export function SignPad({ bookingId }: { bookingId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"loading" | "open" | "finalizing" | "done">("loading");

  useEffect(() => {
    let cancelled = false;
    type HelloSignInstance = {
      open: (url: string, opts?: { testMode?: boolean; skipDomainVerification?: boolean }) => void;
      on: (event: string, cb: (data?: unknown) => void) => void;
      close: () => void;
    };
    let client: HelloSignInstance | null = null;

    (async () => {
      const clientId = process.env.NEXT_PUBLIC_HELLOSIGN_CLIENT_ID;
      if (!clientId) {
        setError("NEXT_PUBLIC_HELLOSIGN_CLIENT_ID is not configured");
        return;
      }
      const mod = await import("hellosign-embedded");
      if (cancelled) return;
      const HelloSign = mod.default as new (opts: { clientId: string }) => HelloSignInstance;
      client = new HelloSign({ clientId });

      client.on("sign", async () => {
        setPhase("finalizing");
        try {
          const res = await fetch(`/api/bookings/${bookingId}/finalize-signature`, { method: "POST" });
          if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            setError(json.error ?? "Failed to confirm signature");
            setPhase("open");
            return;
          }
          setPhase("done");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to confirm signature");
          setPhase("open");
        }
      });

      client.on("error", (data: unknown) => {
        const msg = (data as { message?: string } | undefined)?.message;
        setError(`Signing error: ${msg ?? "unknown"}`);
      });

      try {
        const res = await fetch(`/api/bookings/${bookingId}/start-signature`, { method: "POST" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.sign_url) {
          setError(json.error ?? "Failed to start signing");
          return;
        }
        setPhase("open");
        client.open(json.sign_url, { testMode: true, skipDomainVerification: true });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to start signing");
      }
    })();

    return () => {
      cancelled = true;
      try { client?.close(); } catch { /* noop */ }
    };
  }, [bookingId]);

  function reopen() {
    setPhase("loading");
    setError(null);
    // Force re-mount of the effect by toggling a key — simplest is
    // a page reload here, since the effect captures bookingId only.
    window.location.reload();
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        The agreement will open in a signing window. Review carefully, sign at the bottom, and submit.
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
      {phase === "open" && !error && (
        <div className="rounded-lg border border-ink/15 bg-paper px-4 py-3 text-sm text-muted">
          The signing window should be open. If you closed it accidentally,{" "}
          <button type="button" onClick={reopen} className="underline text-accent">
            click here to reopen it
          </button>.
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
