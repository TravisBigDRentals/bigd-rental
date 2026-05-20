"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const updateInput = z.object({
  first_name: z.string().min(1).max(60),
  last_name: z.string().min(1).max(60),
  business_name: z.string().max(120).nullable().optional(),
  phone: z.string().min(7).max(40),
  customer_address_line1: z.string().min(1),
  customer_address_line2: z.string().nullable().optional(),
  customer_city: z.string().min(1),
  customer_province: z.string().min(1),
  customer_postal_code: z.string().min(1),
  project_address_line1: z.string().min(1),
  project_address_line2: z.string().nullable().optional(),
  project_city: z.string().min(1),
  project_province: z.string().min(1),
  project_postal_code: z.string().min(1),
  drivers_license_front_path: z.string().nullable().optional(),
  drivers_license_back_path: z.string().nullable().optional(),
});

export type UpdateAccountResult = { success?: true; error?: string } | null;

export async function updateAccountAction(
  _prev: UpdateAccountResult,
  formData: FormData,
): Promise<UpdateAccountResult> {
  const raw = Object.fromEntries(formData.entries());
  // Normalize blanks to null where the schema allows it.
  for (const k of ["business_name", "customer_address_line2", "project_address_line2", "drivers_license_front_path", "drivers_license_back_path"]) {
    if (raw[k] === "") raw[k] = null as unknown as string;
  }
  const parsed = updateInput.safeParse(raw);
  if (!parsed.success) {
    return { error: "Some fields are invalid. Check required entries and try again." };
  }

  const server = await createSupabaseServerClient();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const service = createSupabaseServiceClient();
  const fields = parsed.data;

  const updateData: Record<string, string | null> = {
    first_name: fields.first_name,
    last_name: fields.last_name,
    business_name: fields.business_name ?? null,
    phone: fields.phone,
    customer_address_line1: fields.customer_address_line1,
    customer_address_line2: fields.customer_address_line2 ?? null,
    customer_city: fields.customer_city,
    customer_province: fields.customer_province,
    customer_postal_code: fields.customer_postal_code,
    project_address_line1: fields.project_address_line1,
    project_address_line2: fields.project_address_line2 ?? null,
    project_city: fields.project_city,
    project_province: fields.project_province,
    project_postal_code: fields.project_postal_code,
  };
  // DL paths are only updated when the user explicitly re-uploaded — otherwise
  // we leave the existing license on file unchanged.
  if (fields.drivers_license_front_path) {
    updateData.drivers_license_front_url = fields.drivers_license_front_path;
  }
  if (fields.drivers_license_back_path) {
    updateData.drivers_license_back_url = fields.drivers_license_back_path;
  }

  const { error: updErr } = await service
    .from("customers")
    .update(updateData)
    .eq("auth_user_id", user.id);
  if (updErr) return { error: updErr.message };

  revalidatePath("/account/details");
  revalidatePath("/book");
  return { success: true };
}
