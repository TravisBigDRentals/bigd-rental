import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Equipment = {
  id: string;
  name: string;
  serial: string;
  type: "excavator" | "skid_steer" | "attachment";
  daily_rate_cents: number;
  weekly_rate_cents: number | null;
  monthly_rate_cents: number | null;
  insured_value_cents: number | null;
  available_for_booking: boolean;
  image_url: string | null;
};

export type Addon = {
  id: string;
  name: string;
  daily_rate_cents: number;
  compatible_equipment_type: "excavator" | "skid_steer" | "attachment";
  image_url: string | null;
};

export async function listEquipment(): Promise<Equipment[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("equipment")
    .select("id, name, serial, type, daily_rate_cents, weekly_rate_cents, monthly_rate_cents, insured_value_cents, available_for_booking, image_url")
    .eq("available_for_booking", true)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Equipment[];
}

export async function listAddons(): Promise<Addon[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("addons")
    .select("id, name, daily_rate_cents, compatible_equipment_type, image_url")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Addon[];
}
