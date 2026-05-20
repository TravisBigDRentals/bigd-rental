import { getCurrentCustomer } from "@/lib/customers/current";
import { AccountDetailsForm, type AccountInitial } from "./edit-form";

export const metadata = {
  title: "Account details — Big D's Rental Co.",
};

export default async function AccountDetailsPage() {
  // Layout already redirected unauthenticated users.
  const current = await getCurrentCustomer();
  if (!current) return null; // layout guards this; satisfies TS

  const c = current.customer;
  const initial: AccountInitial = {
    first_name: c?.first_name ?? "",
    last_name: c?.last_name ?? "",
    business_name: c?.business_name ?? "",
    email: current.authEmail ?? "",
    phone: c?.phone ?? "",
    customer_address_line1: c?.customer_address_line1 ?? "",
    customer_address_line2: c?.customer_address_line2 ?? "",
    customer_city: c?.customer_city ?? "",
    customer_province: c?.customer_province ?? "",
    customer_postal_code: c?.customer_postal_code ?? "",
    project_address_line1: c?.project_address_line1 ?? "",
    project_address_line2: c?.project_address_line2 ?? "",
    project_city: c?.project_city ?? "",
    project_province: c?.project_province ?? "",
    project_postal_code: c?.project_postal_code ?? "",
    has_license: !!(c?.drivers_license_front_url && c?.drivers_license_back_url),
  };

  return (
    <section>
      <div className="mb-6">
        <h2 className="font-display text-2xl font-semibold">Account details</h2>
        <p className="mt-1 text-sm text-muted">
          {c
            ? "Update your contact info, addresses, and license. Saved changes pre-fill your next booking."
            : "Fill in your details so future bookings pre-fill. You can also fill them in during your first booking."}
        </p>
      </div>
      <AccountDetailsForm initial={initial} />
    </section>
  );
}
