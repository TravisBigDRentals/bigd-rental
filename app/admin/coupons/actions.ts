"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Result = { error?: string; ok?: string } | null;

export async function createCouponAction(_prev: Result, formData: FormData): Promise<Result> {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const discountType = String(formData.get("discount_type") ?? "") as "percent" | "amount";
  const discountValueRaw = String(formData.get("discount_value") ?? "");
  const maxUsesRaw = String(formData.get("max_uses") ?? "").trim();
  const expiresAtRaw = String(formData.get("expires_at") ?? "").trim();

  if (!code) return { error: "Code is required" };
  if (!/^[A-Z0-9_-]+$/.test(code)) return { error: "Code can only contain letters, numbers, _ and -" };
  if (discountType !== "percent" && discountType !== "amount") return { error: "Pick a discount type" };

  const discountValue = Number(discountValueRaw);
  if (!Number.isFinite(discountValue) || discountValue <= 0) return { error: "Discount value must be a positive number" };
  if (discountType === "percent" && (discountValue < 1 || discountValue > 100)) {
    return { error: "Percent must be between 1 and 100" };
  }
  const discountValueInt = discountType === "amount"
    ? Math.round(discountValue * 100) // dollars → cents
    : Math.round(discountValue);

  let maxUses: number | null = null;
  if (maxUsesRaw) {
    const n = Number(maxUsesRaw);
    if (!Number.isInteger(n) || n <= 0) return { error: "Max uses must be a positive whole number, or leave blank for unlimited" };
    maxUses = n;
  }

  let expiresAt: string | null = null;
  if (expiresAtRaw) {
    // <input type="date"> gives YYYY-MM-DD; treat as end-of-day in local TZ
    const d = new Date(`${expiresAtRaw}T23:59:59`);
    if (Number.isNaN(d.getTime())) return { error: "Expiry date isn't a valid date" };
    expiresAt = d.toISOString();
  }

  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.from("coupons").insert({
    code,
    discount_type: discountType,
    discount_value: discountValueInt,
    max_uses: maxUses,
    expires_at: expiresAt,
    active: true,
  });
  if (error) {
    if (error.message.toLowerCase().includes("duplicate")) {
      return { error: `Code "${code}" already exists` };
    }
    return { error: error.message };
  }

  revalidatePath("/admin/coupons");
  return { ok: `Created ${code}` };
}

export async function toggleCouponActiveAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) return;

  const supabase = createSupabaseServiceClient();
  await supabase.from("coupons").update({ active }).eq("id", id);
  revalidatePath("/admin/coupons");
}
