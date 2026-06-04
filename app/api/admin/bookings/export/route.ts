import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { calculatePricing, formatCents, rentalDays } from "@/lib/pricing";

export const runtime = "nodejs";

type Customer = {
  first_name: string;
  last_name: string;
  business_name: string | null;
  email: string;
  phone: string;
  customer_address_line1: string | null;
  customer_address_line2: string | null;
  customer_city: string | null;
  customer_province: string | null;
  customer_postal_code: string | null;
  project_address_line1: string | null;
  project_address_line2: string | null;
  project_city: string | null;
  project_province: string | null;
  project_postal_code: string | null;
};
type Equipment = { name: string; serial: string; daily_rate_cents: number; weekly_rate_cents: number | null; monthly_rate_cents: number | null };
type Addon = { name: string; daily_rate_cents: number };
type BookingRow = {
  id: string;
  status: string;
  start_date: string;
  end_date: string;
  dropoff_time: string | null;
  total_cents: number;
  payment_intent_id: string | null;
  paid_at: string | null;
  signature_completed_at: string | null;
  delivered_at: string | null;
  returned_at: string | null;
  created_at: string;
  customer: Customer | Customer[] | null;
  equipment: Equipment | Equipment[] | null;
  booking_addons: { addon: Addon | Addon[] | null }[] | null;
};

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

// CSV cell escape — wrap in double quotes if it contains separator/quote/newline,
// double up internal quotes per RFC 4180.
function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function joinAddress(parts: (string | null | undefined)[]): string {
  return parts.filter((p) => p && p.trim()).join(", ");
}

export async function GET() {
  // Admin gate — middleware doesn't match /api/*, so check here.
  const serverClient = await createSupabaseServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  const adminEmails = new Set(
    (process.env.BIGDS_ADMIN_EMAIL ?? "")
      .toLowerCase()
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (!user?.email || !adminEmails.has(user.email.toLowerCase())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(`
      id, status, start_date, end_date, dropoff_time, total_cents,
      payment_intent_id, paid_at, signature_completed_at,
      delivered_at, returned_at, created_at,
      customer:customer_id (
        first_name, last_name, business_name, email, phone,
        customer_address_line1, customer_address_line2, customer_city, customer_province, customer_postal_code,
        project_address_line1, project_address_line2, project_city, project_province, project_postal_code
      ),
      equipment:equipment_id ( name, serial, daily_rate_cents, weekly_rate_cents, monthly_rate_cents ),
      booking_addons ( addon:addon_id ( name, daily_rate_cents ) )
    `)
    .order("created_at", { ascending: false });
  if (error) return new Response(`Query failed: ${error.message}`, { status: 500 });

  const headers = [
    "Booking ID",
    "Created",
    "Status",
    "Customer first name",
    "Customer last name",
    "Business",
    "Email",
    "Phone",
    "Equipment",
    "Equipment serial",
    "Daily rate (CAD)",
    "Delivery date",
    "Pickup date",
    "Rental days",
    "Drop-off time",
    "Add-ons",
    "Equipment subtotal (CAD)",
    "Add-ons subtotal (CAD)",
    "Total (CAD)",
    "Total cents (raw)",
    "Square payment ID",
    "Paid at (UTC)",
    "Signed at (UTC)",
    "Delivered at (UTC)",
    "Returned at (UTC)",
    "Billing address",
    "Project address",
  ];

  const lines: string[] = [headers.map(cell).join(",")];
  for (const raw of (data as unknown as BookingRow[]) ?? []) {
    const customer = unwrap(raw.customer);
    const equipment = unwrap(raw.equipment);
    const addons: Addon[] = (raw.booking_addons ?? [])
      .map((ba) => unwrap(ba.addon))
      .filter((a): a is Addon => !!a);
    const days = rentalDays(raw.start_date, raw.end_date);
    const pricing = equipment
      ? calculatePricing({
          startDate: raw.start_date,
          endDate: raw.end_date,
          equipmentDailyRateCents: equipment.daily_rate_cents,
          equipmentWeeklyRateCents: equipment.weekly_rate_cents,
          equipmentMonthlyRateCents: equipment.monthly_rate_cents,
          addons: addons.map((a) => ({ addonId: "", dailyRateCents: a.daily_rate_cents, quantity: 1 })),
        })
      : null;
    const addonsCol = addons.length === 0
      ? ""
      : addons
          .map((a, i) => i === 0 ? `${a.name} (free)` : `${a.name} (${formatCents(a.daily_rate_cents)}/day)`)
          .join("; ");

    const row = [
      raw.id,
      raw.created_at,
      raw.status,
      customer?.first_name,
      customer?.last_name,
      customer?.business_name ?? "",
      customer?.email,
      customer?.phone,
      equipment?.name,
      equipment?.serial,
      equipment ? formatCents(equipment.daily_rate_cents) : "",
      raw.start_date,
      raw.end_date,
      days,
      raw.dropoff_time ?? "",
      addonsCol,
      pricing ? formatCents(pricing.equipmentCents) : "",
      pricing ? formatCents(pricing.addonsCents) : "",
      formatCents(raw.total_cents),
      raw.total_cents,
      raw.payment_intent_id ?? "",
      raw.paid_at ?? "",
      raw.signature_completed_at ?? "",
      raw.delivered_at ?? "",
      raw.returned_at ?? "",
      joinAddress([
        customer?.customer_address_line1, customer?.customer_address_line2,
        customer?.customer_city, customer?.customer_province, customer?.customer_postal_code,
      ]),
      joinAddress([
        customer?.project_address_line1, customer?.project_address_line2,
        customer?.project_city, customer?.project_province, customer?.project_postal_code,
      ]),
    ];
    lines.push(row.map(cell).join(","));
  }

  const csv = lines.join("\n");
  const today = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bigds-bookings-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
