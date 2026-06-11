"use client";

import { useEffect } from "react";

// When BoldSign redirects the embedded iframe here, we tell the parent
// window (the /book booking form OR the standalone /book/[id]/sign page)
// that signing is done. Parent then calls finalize-signature and
// advances the user to the next step.
export function SignedCallback({ bookingId }: { bookingId: string }) {
  useEffect(() => {
    try {
      window.parent.postMessage(
        { type: "bigds:boldsign:signed", bookingId },
        "*",
      );
    } catch {
      // If parent is gone (window closed) just render the message UI.
    }
  }, [bookingId]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-paper px-6">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl uppercase tracking-wide">Signature received</h1>
        <p className="mt-3 text-sm text-muted">
          One moment — finishing up.
        </p>
      </div>
    </main>
  );
}
