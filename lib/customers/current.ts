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
// Before fetching, we opportunistically claim any anonymous bookings
// submitted under the same email. Policy: signing in is treated as
// proof you own the email, so orphan bookings under that email roll
// into your account. In production this depends on Supabase Auth
// having email confirmation enabled — otherwise a bad actor could
// sign up with someone else's email and claim their bookings.
export async function getCurrentCustomer(): Promise<CurrentCustomer | null> {
  const serverClient = await createSupabaseServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return null;

  if (user.email) {
    await claimOrphanBookingsForUser(user.id, user.email);
  }

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

// Finds anonymous customer rows under the user's email and merges them
// into the user's account so the bookings appear in their portal.
// Idempotent — safe to call on every page load.
async function claimOrphanBookingsForUser(authUserId: string, email: string) {
  const service = createSupabaseServiceClient();
  const normalized = email.toLowerCase().trim();

  const { data: orphans } = await service
    .from("customers")
    .select("id, created_at")
    .is("auth_user_id", null)
    .eq("email", normalized)
    .order("created_at", { ascending: false });

  if (!orphans || orphans.length === 0) return;

  const { data: ownRow } = await service
    .from("customers")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  // Pick a target row to absorb the orphans' bookings. If the user
  // already has their own customer row, repoint into it; otherwise
  // promote the most recent orphan by stamping it with auth_user_id.
  let targetCustomerId: string;
  let orphansToDelete: string[];
  if (ownRow) {
    targetCustomerId = ownRow.id;
    orphansToDelete = orphans.map((o) => o.id);
  } else {
    const [primary, ...rest] = orphans;
    const { error: promoteErr } = await service
      .from("customers")
      .update({ auth_user_id: authUserId })
      .eq("id", primary.id);
    if (promoteErr) return;
    targetCustomerId = primary.id;
    orphansToDelete = rest.map((o) => o.id);
  }

  if (orphansToDelete.length === 0) return;

  // bookings.customer_id has ON DELETE RESTRICT, so we repoint before
  // deleting. Both queries are idempotent.
  const { error: repointErr } = await service
    .from("bookings")
    .update({ customer_id: targetCustomerId })
    .in("customer_id", orphansToDelete);
  if (repointErr) return;

  await service.from("customers").delete().in("id", orphansToDelete);
}
