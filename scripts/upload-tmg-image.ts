/**
 * One-off: upload TMG-Industrial-Vibratory.webp to the equipment-images
 * bucket. Idempotent (upsert).
 *   npx tsx scripts/upload-tmg-image.ts
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

const SOURCE = join(homedir(), "Downloads", "TMG-Industrial-Vibratory.webp");
const TARGET = "TMG-Industrial-Vibratory.webp";

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const bytes = readFileSync(SOURCE);

  const { error } = await supabase.storage
    .from("equipment-images")
    .upload(TARGET, bytes, { contentType: "image/webp", upsert: true });

  if (error) {
    console.error(`Upload failed: ${error.message}`);
    process.exit(1);
  }
  console.log(`Uploaded ${TARGET} (${bytes.length.toLocaleString()} bytes)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
