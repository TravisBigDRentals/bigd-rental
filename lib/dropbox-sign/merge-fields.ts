import { formatCents, rentalDays } from "@/lib/pricing";

export type CustomerLike = {
  first_name: string;
  last_name: string;
  business_name: string | null;
  email: string;
  phone: string;
  customer_address_line1: string;
  customer_address_line2: string | null;
  customer_city: string;
  customer_province: string;
  customer_postal_code: string;
  project_address_line1: string;
  project_address_line2: string | null;
  project_city: string;
  project_province: string;
  project_postal_code: string;
};

export type BookingLike = {
  start_date: string;
  end_date: string;
  dropoff_time: string | null;
  total_cents: number;
};

export type EquipmentLike = { name: string; serial: string; daily_rate_cents: number };

export type AddonLike = { name: string; daily_rate_cents: number };

function formatLongDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-CA", {
    year: "numeric", month: "long", day: "numeric",
  });
}

// Trim the street value for Dropbox Sign template fields. Customers
// sometimes paste the full concatenated address ("5219 Falsbridge Dr NE,
// Calgary, AB T3J 3C1") into Step-2 line1 instead of just the street.
// Take everything before the first comma if present — that's the actual
// street segment. The standalone city/province/postal fields populate
// their own merge fields. Then hard-cap at 32 chars so we never trip the
// template's ~33-char width limit even on outlier street names.
function street(line1: string): string {
  const trimmed = line1.split(",")[0].trim();
  return trimmed.length > 32 ? trimmed.slice(0, 32) : trimmed;
}

// Builds the merge fields payload for the Dropbox Sign template. Names match
// what the template defines — if the template doesn't have a given field,
// Dropbox Sign just ignores the extra; if a template field isn't passed
// here, it stays blank on the signed PDF.
export function buildMergeFields(
  customer: CustomerLike,
  booking: BookingLike,
  equipment: EquipmentLike,
  addons: AddonLike[],
): Array<{ name: string; value: string }> {
  const todayISO = new Date().toISOString().slice(0, 10);
  const addonsSummary = addons.length === 0
    ? "None"
    : addons
        .map((a, i) => i === 0 ? `${a.name} (free)` : `${a.name} ($${(a.daily_rate_cents / 100).toFixed(2)}/day)`)
        .join(", ");

  return [
    { name: "customer_full_name",       value: `${customer.first_name} ${customer.last_name}`.trim() },
    { name: "customer_business_name",   value: customer.business_name ?? "" },
    { name: "customer_email",           value: customer.email },
    { name: "customer_phone",           value: customer.phone },
    { name: "customer_address_line1",   value: street(customer.customer_address_line1) },
    { name: "customer_city",            value: customer.customer_city },
    { name: "customer_province",        value: customer.customer_province },
    { name: "customer_postal_code",     value: customer.customer_postal_code },
    { name: "project_address_line1",    value: street(customer.project_address_line1) },
    { name: "project_city",             value: customer.project_city },
    { name: "project_province",         value: customer.project_province },
    { name: "project_postal_code",      value: customer.project_postal_code },
    { name: "delivery_date",            value: formatLongDate(booking.start_date) },
    { name: "pickup_date",              value: formatLongDate(booking.end_date) },
    { name: "dropoff_time",             value: booking.dropoff_time ?? "" },
    { name: "agreement_date",           value: formatLongDate(todayISO) },
    { name: "equipment_name",           value: equipment.name },
    { name: "equipment_serial",         value: equipment.serial },
    { name: "equipment_daily_rate_cad", value: formatCents(equipment.daily_rate_cents) },
    { name: "rental_days",              value: String(rentalDays(booking.start_date, booking.end_date)) },
    { name: "addons_summary",           value: addonsSummary },
    { name: "total_cad",                value: formatCents(booking.total_cents) },
  ];
}
