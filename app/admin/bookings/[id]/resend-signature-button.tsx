"use client";

import { useState } from "react";

export function ResendSignatureButton({ bookingId }: { bookingId: string }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok?: string; error?: string } | null>(null);

  async function send() {
    if (pending) return;
    setPending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/resend-signature`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        setResult({ error: json.error ?? "Send failed" });
      } else {
        setResult({ ok: `Signature link emailed to ${json.sent_to}.` });
      }
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Send failed" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={send}
        disabled={pending}
        className="rounded-full bg-accent px-4 py-2 text-sm text-paper font-medium hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
      >
        {pending ? "Sending…" : "Email signature link to customer"}
      </button>
      {result?.ok && (
        <p className="mt-2 text-xs text-emerald-800">{result.ok}</p>
      )}
      {result?.error && (
        <p className="mt-2 text-xs text-red-700">{result.error}</p>
      )}
    </div>
  );
}
