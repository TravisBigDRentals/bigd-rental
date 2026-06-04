import { listAddons, listEquipment } from "@/lib/bookings/queries";
import { getCurrentCustomer } from "@/lib/customers/current";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { BookingForm } from "./booking-form";
import { SiteNav } from "@/components/site-nav";

export const metadata = {
  title: "Book Equipment — Big D's Rental Co.",
};

type DropoffTime = "9:00 AM" | "10:00 AM";

// Prefill data carried over from a prior booking when the customer
// clicks "Add another machine for these dates" on the confirmation
// page. Shape mirrors the BookingForm's InitialCustomer + the booking's
// date/time fields so we can drop it straight into the form.
type PrefillBundle = {
  customer: {
    first_name: string;
    last_name: string;
    business_name: string | null;
    email: string;
    phone: string;
    drivers_license_front_url: string;
    drivers_license_back_url: string;
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
  start_date: string;
  end_date: string;
  dropoff_time: DropoffTime;
};

async function loadPrefill(bookingId: string): Promise<PrefillBundle | null> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("bookings")
    .select(`
      start_date, end_date, dropoff_time,
      drivers_license_front_url, drivers_license_back_url,
      customer:customer_id (
        first_name, last_name, business_name, email, phone,
        drivers_license_front_url, drivers_license_back_url,
        customer_address_line1, customer_address_line2, customer_city, customer_province, customer_postal_code,
        project_address_line1, project_address_line2, project_city, project_province, project_postal_code
      )
    `)
    .eq("id", bookingId)
    .maybeSingle();

  if (!data) return null;
  // Defensive unwrap (nested FK relations sometimes come back as
  // array-of-one in PostgREST responses).
  const c = Array.isArray(data.customer) ? data.customer[0] : data.customer;
  if (!c) return null;

  // Prefer the booking's per-booking DL snapshot over the customer
  // row — that's the license that was on file at the moment of the
  // prior booking, which is what we want to re-use here.
  const dlFront = data.drivers_license_front_url ?? c.drivers_license_front_url ?? "";
  const dlBack = data.drivers_license_back_url ?? c.drivers_license_back_url ?? "";

  const dropoff: DropoffTime = data.dropoff_time === "10:00 AM" ? "10:00 AM" : "9:00 AM";

  return {
    customer: {
      first_name: c.first_name,
      last_name: c.last_name,
      business_name: c.business_name,
      email: c.email,
      phone: c.phone,
      drivers_license_front_url: dlFront,
      drivers_license_back_url: dlBack,
      customer_address_line1: c.customer_address_line1,
      customer_address_line2: c.customer_address_line2,
      customer_city: c.customer_city,
      customer_province: c.customer_province,
      customer_postal_code: c.customer_postal_code,
      project_address_line1: c.project_address_line1,
      project_address_line2: c.project_address_line2,
      project_city: c.project_city,
      project_province: c.project_province,
      project_postal_code: c.project_postal_code,
    },
    start_date: data.start_date,
    end_date: data.end_date,
    dropoff_time: dropoff,
  };
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ prefill?: string }>;
}) {
  const { prefill } = await searchParams;
  const [equipment, addons, current, prefillData] = await Promise.all([
    listEquipment(),
    listAddons(),
    getCurrentCustomer(),
    prefill ? loadPrefill(prefill) : Promise.resolve(null),
  ]);

  // Prefill takes precedence over signed-in customer pre-fill, since
  // the customer just explicitly asked us to start from a prior booking.
  const initialCustomer = prefillData?.customer ?? current?.customer ?? null;
  const initialStartDate = prefillData?.start_date ?? null;
  const initialEndDate = prefillData?.end_date ?? null;
  const initialDropoffTime = prefillData?.dropoff_time ?? null;

  return (
    <>
      <SiteNav />
      <main className="flex-1 px-6 py-12 sm:py-16">
        <div className="max-w-6xl mx-auto">
          <header className="mb-10">
            <p className="font-mono text-xs tracking-widest text-muted uppercase">
              Calgary, AB · Construction Equipment Rental
            </p>
            <h1 className="mt-2 font-display text-4xl sm:text-5xl font-bold tracking-tight">
              Book Equipment
            </h1>
          </header>

          {!prefillData && current && !current.customer && (
            <p className="mb-6 rounded-lg border border-ink/15 bg-paper px-4 py-3 text-sm text-muted">
              Signed in as <strong>{current.authEmail}</strong>. Your info will be
              saved on your first booking so it pre-fills next time.
            </p>
          )}
          {!prefillData && current?.customer && (
            <p className="mb-6 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
              Signed in as <strong>{current.customer.first_name} {current.customer.last_name}</strong>.
              Step 2 is pre-filled — review and update anything that&rsquo;s changed.
            </p>
          )}

          <BookingForm
            equipment={equipment}
            addons={addons}
            initialCustomer={initialCustomer}
            isAuthenticated={!!current}
            authEmail={current?.authEmail ?? null}
            initialStartDate={initialStartDate}
            initialEndDate={initialEndDate}
            initialDropoffTime={initialDropoffTime}
            prefillNotice={prefillData
              ? "Adding another machine for the same dates. Your info, dates, and license are carried over — just pick a different machine."
              : null}
          />
        </div>
      </main>
    </>
  );
}
