import { NextResponse } from "next/server";
import { createBookingInput } from "@/lib/bookings/schema";
import { calculatePricing } from "@/lib/pricing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // Read the current auth user via cookies. Used to link the new booking
  // to a customer record. If unauthenticated, the booking creates a fresh
  // customer row (no implicit dedup-by-email — that was a privacy hole).
  const serverClient = await createSupabaseServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
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

  // Customer save strategy depends on authentication:
  //   - Authenticated: upsert by auth_user_id. The customer's stored info
  //     gets refreshed on every booking so admin sees the latest details.
  //   - Anonymous: INSERT a fresh customer row. No dedup, no implicit
  //     linking by email — that was the privacy hole we removed.
  const baseCustomerFields = {
    first_name: customer.first_name,
    last_name: customer.last_name,
    business_name: customer.business_name ?? null,
    email: customer.email,
    phone: customer.phone,
    drivers_license_front_url: customer.drivers_license_front_path,
    drivers_license_back_url: customer.drivers_license_back_path,
    customer_address_line1: customer.customer_address_line1,
    customer_address_line2: customer.customer_address_line2 ?? null,
    customer_city: customer.customer_city,
    customer_province: customer.customer_province,
    customer_postal_code: customer.customer_postal_code,
    project_address_line1: customer.project_address_line1,
    project_address_line2: customer.project_address_line2 ?? null,
    project_city: customer.project_city,
    project_province: customer.project_province,
    project_postal_code: customer.project_postal_code,
  } as const;

  let customerRowId: string;
  if (user) {
    // Authenticated: explicit SELECT → UPDATE-or-INSERT instead of upsert.
    // The partial unique index on auth_user_id (WHERE NOT NULL) supports
    // ON CONFLICT but requires a more specific conflict spec that PostgREST
    // doesn't surface cleanly. Two queries is simpler and not in any
    // realistic hot path.
    const { data: existing, error: lookupErr } = await supabase
      .from("customers")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (lookupErr) {
      return NextResponse.json({ error: lookupErr.message }, { status: 500 });
    }
    if (existing) {
      const { error: updErr } = await supabase
        .from("customers")
        .update(baseCustomerFields)
        .eq("id", existing.id);
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
      customerRowId = existing.id;
    } else {
      const { data: row, error: insErr } = await supabase
        .from("customers")
        .insert({ ...baseCustomerFields, auth_user_id: user.id })
        .select("id")
        .single();
      if (insErr || !row) {
        return NextResponse.json(
          { error: insErr?.message ?? "Customer insert failed" },
          { status: 500 },
        );
      }
      customerRowId = row.id;
    }
  } else {
    // Anonymous: fresh customer row every time. No dedup, no email match.
    const { data: row, error: insErr } = await supabase
      .from("customers")
      .insert({ ...baseCustomerFields, auth_user_id: null })
      .select("id")
      .single();
    if (insErr || !row) {
      return NextResponse.json(
        { error: insErr?.message ?? "Customer insert failed" },
        { status: 500 },
      );
    }
    customerRowId = row.id;
  }

  // Insert booking — capture DL paths on the booking itself so each
  // booking has its own immutable audit record of what license was on
  // file at the moment of rental. The customer row tracks "latest",
  // the booking row tracks "at-the-time-of-this-rental".
  const { data: bookingRow, error: bookErr } = await supabase
    .from("bookings")
    .insert({
      customer_id: customerRowId,
      equipment_id: booking.equipment_id,
      start_date: booking.start_date,
      end_date: booking.end_date,
      dropoff_time: booking.dropoff_time,
      special_instructions: booking.special_instructions ?? null,
      status: "pending_signature",
      total_cents: pricing.totalCents,
      drivers_license_front_url: customer.drivers_license_front_path,
      drivers_license_back_url: customer.drivers_license_back_path,
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
