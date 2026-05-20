import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type CurrentCustomer = {
  authUserId: string;
  authEmail: string | null;
  customer: {
    id: string;
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
    drivers_license_front_url: string;
    drivers_license_back_url: string;
  } | null;
};

// Returns the authenticated user + their linked customer row (if any).
// Returns null when no one is signed in.
//
// Customer match is by `auth_user_id` — NEVER by email. The whole point
// of the auth refactor is that signing up doesn't let you claim
// anonymous-booking customer rows that happen to share your email.
export async function getCurrentCustomer(): Promise<CurrentCustomer | null> {
  const serverClient = await createSupabaseServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return null;

  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("customers")
    .select(
      "id, first_name, last_name, business_name, email, phone, customer_address_line1, customer_address_line2, customer_city, customer_province, customer_postal_code, project_address_line1, project_address_line2, project_city, project_province, project_postal_code, drivers_license_front_url, drivers_license_back_url",
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return {
    authUserId: user.id,
    authEmail: user.email ?? null,
    customer: (data as CurrentCustomer["customer"]) ?? null,
  };
}
