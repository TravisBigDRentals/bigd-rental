import { NextResponse } from "next/server";
import { validateCouponCode } from "@/lib/coupons/validate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { code?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code : "";
  const result = await validateCouponCode(code);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 200 });
  }
  return NextResponse.json({
    ok: true,
    code: result.coupon.code,
    discount_type: result.coupon.discount_type,
    discount_value: result.coupon.discount_value,
  });
}
