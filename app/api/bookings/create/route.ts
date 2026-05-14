import { NextResponse } from "next/server";
import { createBookingInput } from "@/lib/bookings/schema";
import { calculatePricing } from "@/lib/pricing";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createBookingInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }
  const { customer, booking } = parsed.data;

  const supabase = createSupabaseServiceClient();

  // Validate equipment availability + fetch rate
  const { data: equipment, error: eqErr } = await supabase
    .from("equipment")
    .select("id, daily_rate_cents, available_for_booking, type")
    .eq("id", booking.equipment_id)
    .single();
  if (eqErr || !equipment) {
    return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
  }
  if (!equipment.available_for_booking) {
    return NextResponse.json({ error: "Equipment not available" }, { status: 400 });
  }

  // Fetch addons + validate compatibility
  let addons: { id: string; daily_rate_cents: number; compatible_equipment_type: string }[] = [];
  if (booking.addon_ids.length > 0) {
    const { data, error: addErr } = await supabase
      .from("addons")
      .select("id, daily_rate_cents, compatible_equipment_type")
      .in("id", booking.addon_ids);
    if (addErr) return NextResponse.json({ error: addErr.message }, { status: 500 });
    addons = data ?? [];

    const incompatible = addons.filter(
      (a) => a.compatible_equipment_type !== equipment.type,
    );
    if (incompatible.length > 0) {
      return NextResponse.json(
        { error: "One or more add-ons are not compatible with the selected equipment" },
        { status: 400 },
      );
    }
  }

  // Authoritative pricing on the server — never trust client-side totals
  const pricing = calculatePricing({
    startDate: booking.start_date,
    endDate: booking.end_date,
    equipmentDailyRateCents: equipment.daily_rate_cents,
    addons: addons.map((a) => ({
      addonId: a.id,
      dailyRateCents: a.daily_rate_cents,
      quantity: 1,
    })),
  });

  // Upsert customer by email
  const { data: customerRow, error: custErr } = await supabase
    .from("customers")
    .upsert(
      {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        drivers_license_url: customer.drivers_license_path ?? null,
        project_address_line1: customer.project_address_line1 ?? null,
        project_address_line2: customer.project_address_line2 ?? null,
        project_city: customer.project_city ?? null,
        project_province: customer.project_province ?? null,
        project_postal_code: customer.project_postal_code ?? null,
      },
      { onConflict: "email" },
    )
    .select("id")
    .single();
  if (custErr || !customerRow) {
    return NextResponse.json(
      { error: custErr?.message ?? "Customer upsert failed" },
      { status: 500 },
    );
  }

  // Insert booking
  const { data: bookingRow, error: bookErr } = await supabase
    .from("bookings")
    .insert({
      customer_id: customerRow.id,
      equipment_id: booking.equipment_id,
      start_date: booking.start_date,
      end_date: booking.end_date,
      dropoff_time: booking.dropoff_time ?? null,
      special_instructions: booking.special_instructions ?? null,
      status: "pending_payment",
      total_cents: pricing.totalCents,
    })
    .select("id")
    .single();

  if (bookErr || !bookingRow) {
    const msg = bookErr?.message ?? "";
    if (msg.includes("conflicts with existing")) {
      return NextResponse.json(
        { error: "Those dates conflict with an existing booking", code: "DATE_CONFLICT" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: msg || "Booking insert failed" }, { status: 500 });
  }

  // Snapshot booking_addons line items
  if (addons.length > 0) {
    const rows = addons.map((a) => ({
      booking_id: bookingRow.id,
      addon_id: a.id,
      daily_rate_cents: a.daily_rate_cents,
    }));
    const { error: baErr } = await supabase.from("booking_addons").insert(rows);
    if (baErr) {
      return NextResponse.json({ error: baErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    booking_id: bookingRow.id,
    total_cents: pricing.totalCents,
    days: pricing.days,
  });
}
