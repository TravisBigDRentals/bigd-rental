"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/pricing";

type Props = {
  bookingId: string;
  totalCents: number;
  hasPayment: boolean;
};

export function CancelBookingButton({ bookingId, totalCents, hasPayment }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [issueRefund, setIssueRefund] = useState(hasPayment);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined, issue_refund: issueRefund }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Cancellation failed");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancellation failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-900 hover:bg-red-100 transition-colors"
      >
        Cancel booking
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-paper p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold uppercase">Cancel this booking?</h2>
            <p className="mt-2 text-sm text-muted">
              The booking will be marked canceled and the dates will become available for new bookings.
              {hasPayment && " A Square refund will be issued unless you opt out below."}
            </p>

            <label className="mt-5 block">
              <span className="block text-xs font-mono uppercase tracking-widest text-muted">
                Reason (optional — included in the customer email)
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
                placeholder="e.g. Machine unavailable due to maintenance"
              />
            </label>

            {hasPayment && (
              <label className="mt-4 flex items-start gap-3 rounded-lg border border-ink/15 bg-paper px-4 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={issueRefund}
                  onChange={(e) => setIssueRefund(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
                />
                <span className="text-sm">
                  Issue Square refund of <strong>{formatCents(totalCents)}</strong>
                  <span className="block text-xs text-muted mt-1">
                    Uncheck only if you&rsquo;re refunding manually (dispute, partial keep, etc.)
                  </span>
                </span>
              </label>
            )}

            {error && (
              <p className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
                {error}
              </p>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-full px-4 py-2 text-sm font-medium hover:bg-ink/5 transition-colors"
              >
                Keep booking
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-paper hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {pending ? "Canceling…" : "Cancel booking"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
