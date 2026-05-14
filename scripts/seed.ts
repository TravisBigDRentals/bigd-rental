/**
 * Programmatic seed — alternative to running supabase/seed.sql in the SQL editor.
 *   npx tsx scripts/seed.ts
 *
 * Requires SUPABASE_SECRET_KEY in .env.local.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function main() {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  const equipment = [
    { name: "Kubota U10-5 Mini Excavator",     serial: "KBCAZ16CKP3B10665", type: "excavator",  daily_rate_cents: 95000, insured_value_cents: 3700000 },
    { name: "Kubota SCL 1000 Mini Skid Steer", serial: "KBXLCA1CPTLA22675", type: "skid_steer", daily_rate_cents: 42500, insured_value_cents: 5600000 },
  ];

  const addons = [
    { name: 'Toothed Bucket 36" (AP-CL136LT)', daily_rate_cents: 4000, compatible_equipment_type: "excavator"  },
    { name: 'Smooth Bucket 42" (AP-CL142LC)',  daily_rate_cents: 4000, compatible_equipment_type: "excavator"  },
    { name: 'Pallet Fork 36"',                 daily_rate_cents: 4000, compatible_equipment_type: "skid_steer" },
    { name: "Boxer Auger ML1100",              daily_rate_cents: 4000, compatible_equipment_type: "skid_steer" },
    { name: "Trencher",                        daily_rate_cents: 4000, compatible_equipment_type: "skid_steer" },
  ];

  const { error: eqErr } = await supabase.from("equipment").upsert(equipment, { onConflict: "serial" });
  if (eqErr) throw eqErr;

  const { error: addErr } = await supabase.from("addons").upsert(addons, { onConflict: "name" });
  if (addErr) throw addErr;

  console.log(`Seeded ${equipment.length} equipment + ${addons.length} addons`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
