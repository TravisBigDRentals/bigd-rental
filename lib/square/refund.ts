import "server-only";
import { getSquareClient } from "./server";

export type RefundResult =
  | { ok: true; refundId: string; amountCents: number }
  | { ok: false; error: string };

// Refund a Square payment in full. We pass the booking id as the
// idempotency key so retries (e.g. from a flaky network) don't issue
// double refunds.
export async function refundSquarePaymentFull(opts: {
  paymentId: string;
  amountCents: number;
  bookingId: string;
  reason?: string;
}): Promise<RefundResult> {
  const square = getSquareClient();
  try {
    const res = await square.refunds.refundPayment({
      idempotencyKey: `refund-${opts.bookingId}`,
      paymentId: opts.paymentId,
      amountMoney: { amount: BigInt(opts.amountCents), currency: "CAD" },
      reason: opts.reason?.slice(0, 192),
    });
    const refund = res.refund;
    if (!refund?.id) {
      return { ok: false, error: "Square returned no refund id" };
    }
    return { ok: true, refundId: refund.id, amountCents: opts.amountCents };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Square refund failed";
    return { ok: false, error: msg };
  }
}
