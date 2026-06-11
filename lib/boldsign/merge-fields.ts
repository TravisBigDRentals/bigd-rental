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
  drivers_license_number?: string | null;
  drivers_license_expiry?: string | null;
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

// Customers occasionally paste a full concatenated address into Step 2
// line1. Take just the segment before the first comma so the template
// field isn't crammed with city/province too. Hard cap so unusual lengths
// don't blow past template field widths.
function street(line1: string): string {
  const trimmed = line1.split(",")[0].trim();
  return trimmed.length > 60 ? trimmed.slice(0, 60) : trimmed;
}

// Builds the array of {id, value} pairs that BoldSign expects in
// existingFormFields. Field IDs MUST exactly match what's set on the
// SENDER-assigned fields in the template editor — the BoldSign template
// constraint that IDs are unique within a doc means duplicated fields
// (customer_full_name on page 1 + signature page) get suffixed _2/_3,
// and we explicitly fan the same value to each suffix here.

export function buildSenderFields(
  customer: CustomerLike,
  booking: BookingLike,
  equipment: EquipmentLike,
  addons: AddonLike[],
): Array<{ id: string; value: string }> {
  const todayISO = new Date().toISOString().slice(0, 10);
  const today = formatLongDate(todayISO);
  const addonsSummary = addons.length === 0
    ? "None"
    : addons
        .map((a, i) => i === 0 ? `${a.name} (free)` : `${a.name} ($${(a.daily_rate_cents / 100).toFixed(2)}/day)`)
        .join(", ");
  const fullName = `${customer.first_name} ${customer.last_name}`.trim();

  // Canonical values for each "key" the template expects. Then we explode
  // into the actual ID list (including _2, _3 suffix duplicates).
  const canonical: Record<string, string> = {
    customer_full_name:        fullName,
    customer_business_name:    customer.business_name ?? "",
    customer_email:            customer.email,
    customer_phone:            customer.phone,
    customer_address_line1:    street(customer.customer_address_line1),
    customer_city:             customer.customer_city,
    customer_province:         customer.customer_province,
    customer_postal_code:      customer.customer_postal_code,
    project_address_line1:     street(customer.project_address_line1),
    project_city:              customer.project_city,
    project_province:          customer.project_province,
    project_postal_code:       customer.project_postal_code,
    drivers_license_number:    customer.drivers_license_number ?? "",
    drivers_license_expiry:    formatLongDate(customer.drivers_license_expiry ?? ""),
    delivery_date:             formatLongDate(booking.start_date),
    pickup_date:               formatLongDate(booking.end_date),
    dropoff_time:              booking.dropoff_time ?? "",
    agreement_date:            today,
    signed_date:               today,
    equipment_name:            equipment.name,
    equipment_serial:          equipment.serial,
    equipment_daily_rate_cad:  formatCents(equipment.daily_rate_cents),
    rental_days:               String(rentalDays(booking.start_date, booking.end_date)),
    addons_summary:            addonsSummary,
    total_cad:                 formatCents(booking.total_cents),
  };

  // Fields the template duplicates on a second page. Confirmed by Rohit
  // on 2026-06-10: customer_full_name_2 + signed_date_2 (both SENDER).
  // Easy to extend: just add more "<canonical>_<n>" keys here that point
  // back to the same canonical value.
  const aliases: Record<string, string> = {
    customer_full_name_2: canonical.customer_full_name,
    signed_date_2:        canonical.signed_date,
  };

  // start-signature filters this list against what the template actually
  // exposes via templateApi.getTemplate(), so over-sending is harmless.
  return Object.entries({ ...canonical, ...aliases }).map(([id, value]) => ({ id, value }));
}
