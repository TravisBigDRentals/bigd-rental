/**
 * Point-in-time data snapshot using the service-role key.
 *   npx tsx scripts/snapshot-db.ts
 *
 * Writes backups/<YYYY-MM-DD>/<table>.json — one file per table — plus a
 * manifest summarizing row counts. Schema isn't dumped; it lives in
 * supabase/migrations/ already.
 *
 * To restore: read the JSON back into the table via the service client.
 * No FK ordering needed unless restoring into an empty DB — in that case
 * import in this order: equipment, addons, customers, bookings,
 * booking_addons (children last).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const TABLES = [
  "equipment",
  "addons",
  "customers",
  "bookings",
  "booking_addons",
] as const;

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  const today = new Date().toISOString().slice(0, 10);
  const outDir = resolve(process.cwd(), "backups", today);
  mkdirSync(outDir, { recursive: true });

  const manifest: Record<string, number> = {};
  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) {
      console.error(`${table}: FAILED — ${error.message}`);
      process.exit(1);
    }
    const rows = data ?? [];
    writeFileSync(resolve(outDir, `${table}.json`), JSON.stringify(rows, null, 2));
    manifest[table] = rows.length;
    console.log(`${table}: ${rows.length} rows`);
  }

  writeFileSync(
    resolve(outDir, "manifest.json"),
    JSON.stringify({ taken_at: new Date().toISOString(), counts: manifest }, null, 2),
  );
  console.log(`\nSnapshot written to backups/${today}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
