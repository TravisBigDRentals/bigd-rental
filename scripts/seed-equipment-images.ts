/**
 * One-shot: replaces addons with the new Big D's set, creates the
 * `equipment-images` public bucket, uploads the 5 JPEGs from
 * ~/Downloads/bigds_products/, and sets image_url on equipment +
 * addon rows. Idempotent — safe to re-run.
 *
 *   npx tsx scripts/seed-equipment-images.ts
 *
 * Requires migration 0009 to have run (image_url columns must exist).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const BUCKET = "equipment-images";
const IMAGES_DIR = join(homedir(), "Downloads", "bigds_products");

// Storage paths inside the bucket
const IMG = {
  MS_MAIN_SMOOTH_BUCKET: "MS_Main_Smooth_Bucket.jpeg",
  MS_TOOTHED_BUCKET:     "MS_Toothed_Bucket.jpeg",
  MS_PALLET_FORK:        "MS_Pallet_Fork.jpeg",
  MS_AUGER:              "MS_Auger.jpeg",
  ME_MAIN:               "ME_Main.jpeg",
};

// Map storage-path → source filename in ~/Downloads/bigds_products
const SOURCE: Record<string, string> = {
  [IMG.MS_MAIN_SMOOTH_BUCKET]: "MS_Main_Smooth Bucket.jpeg",
  [IMG.MS_TOOTHED_BUCKET]:     "MS_Toothed Bucket.jpeg",
  [IMG.MS_PALLET_FORK]:        "MS_Pallet Fork.jpeg",
  [IMG.MS_AUGER]:              "MS_Auger.jpeg",
  [IMG.ME_MAIN]:               "ME_Main.jpeg",
};

type AddonSpec = { name: string; daily_rate_cents: number; compatible_equipment_type: "skid_steer" | "excavator"; image_url: string | null };

const NEW_ADDONS: AddonSpec[] = [
  // Skid steer attachments — each gets its own combo image
  { name: "Toothed Bucket 36\" (AP-CL136LT)",   daily_rate_cents: 4000, compatible_equipment_type: "skid_steer", image_url: IMG.MS_TOOTHED_BUCKET },
  { name: "Smooth Bucket 42\" (AP-CL142LC)",    daily_rate_cents: 4000, compatible_equipment_type: "skid_steer", image_url: IMG.MS_MAIN_SMOOTH_BUCKET },
  { name: "Pallet Fork 36\" (AP-CPF1236)",      daily_rate_cents: 4000, compatible_equipment_type: "skid_steer", image_url: IMG.MS_PALLET_FORK },
  { name: "Boxer Auger ML1100 (20020571)",        daily_rate_cents: 4000, compatible_equipment_type: "skid_steer", image_url: IMG.MS_AUGER },
  // Excavator placeholder attachments — share the base excavator image
  { name: "Standard Bucket",                       daily_rate_cents: 4000, compatible_equipment_type: "excavator",  image_url: IMG.ME_MAIN },
  { name: "Big Bucket",                            daily_rate_cents: 4000, compatible_equipment_type: "excavator",  image_url: IMG.ME_MAIN },
];

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // 1. Ensure bucket exists + is public
  const { data: buckets } = await supabase.storage.listBuckets();
  const has = (buckets ?? []).find((b) => b.id === BUCKET);
  if (!has) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (error) throw new Error(`createBucket failed: ${error.message}`);
    console.log(`+ created bucket ${BUCKET}`);
  } else if (!has.public) {
    const { error } = await supabase.storage.updateBucket(BUCKET, { public: true });
    if (error) throw new Error(`updateBucket failed: ${error.message}`);
    console.log(`~ made bucket ${BUCKET} public`);
  } else {
    console.log(`✓ bucket ${BUCKET} exists + is public`);
  }

  // 2. Upload all images (upsert=true so re-runs overwrite)
  for (const [storagePath, sourceName] of Object.entries(SOURCE)) {
    const localPath = join(IMAGES_DIR, sourceName);
    const buffer = readFileSync(localPath);
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`upload ${storagePath} failed: ${error.message}`);
    console.log(`+ uploaded ${storagePath} (${buffer.byteLength} bytes)`);
  }

  // 3. Replace addons. booking_addons cascade-deleted with bookings earlier;
  // empty per the precheck. Wipe + insert.
  const { error: delErr } = await supabase.from("addons").delete().not("id", "is", null);
  if (delErr) throw new Error(`delete addons failed: ${delErr.message}`);
  console.log("- wiped existing addons");

  const { error: insErr } = await supabase.from("addons").insert(NEW_ADDONS);
  if (insErr) throw new Error(`insert addons failed: ${insErr.message}`);
  console.log(`+ inserted ${NEW_ADDONS.length} addons`);

  // 4. Set equipment image_url
  const equipmentImages: { match: string; image: string }[] = [
    { match: "Skid Steer", image: IMG.MS_MAIN_SMOOTH_BUCKET },
    { match: "Excavator",  image: IMG.ME_MAIN },
  ];
  for (const e of equipmentImages) {
    const { data: rows, error: lookupErr } = await supabase
      .from("equipment")
      .select("id, name")
      .ilike("name", `%${e.match}%`);
    if (lookupErr) throw new Error(`equipment lookup failed: ${lookupErr.message}`);
    for (const r of rows ?? []) {
      const { error: updErr } = await supabase
        .from("equipment")
        .update({ image_url: e.image })
        .eq("id", r.id);
      if (updErr) throw new Error(`update equipment failed: ${updErr.message}`);
      console.log(`~ set ${r.name} image_url = ${e.image}`);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
