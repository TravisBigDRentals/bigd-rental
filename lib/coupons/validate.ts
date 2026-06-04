import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { Discount } from "@/lib/pricing";

export type CouponRow = {
  id: string;
  code: string;
  discount_type: "percent" | "amount";
  discount_value: number;
  max_uses: number | null;
  expires_at: string | null;
  active: boolean;
};

export type CouponValidationResult =
  | { ok: true; coupon: CouponRow; discount: Discount }
  | { ok: false; error: string };

// Look up a coupon by code (case-insensitive). Checks active, expiry,
// and max_uses (counted via bookings.coupon_id, not a stored counter).
// Returns the discount in calculatePricing's shape on success.
export async function validateCouponCode(code: string): Promise<CouponValidationResult> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { ok: false, error: "Enter a code." };

  const supabase = createSupabaseServiceClient();
  const { data: row, error } = await supabase
    .from("coupons")
    .select("id, code, discount_type, discount_value, max_uses, expires_at, active")
    .eq("code", trimmed)
    .maybeSingle();
  if (error) return { ok: false, error: "Lookup failed. Try again." };
  if (!row) return { ok: false, error: "That code isn't valid." };

  const coupon = row as CouponRow;
  if (!coupon.active) return { ok: false, error: "That code is no longer active." };
  if (coupon.expires_at && new Date(coupon.expires_at) <= new Date()) {
    return { ok: false, error: "That code has expired." };
  }

  if (coupon.max_uses !== null) {
    const { count, error: countErr } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("coupon_id", coupon.id);
    if (countErr) return { ok: false, error: "Usage check failed. Try again." };
    if ((count ?? 0) >= coupon.max_uses) {
      return { ok: false, error: "That code has been fully redeemed." };
    }
  }

  return {
    ok: true,
    coupon,
    discount: { type: coupon.discount_type, value: coupon.discount_value },
  };
}
