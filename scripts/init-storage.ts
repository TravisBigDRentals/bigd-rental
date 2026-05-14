/**
 * Create Supabase Storage buckets needed by the booking flow.
 * Idempotent — skips buckets that already exist.
 *   npx tsx scripts/init-storage.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const BUCKETS = [
  { id: "customer-documents", description: "Driver's licenses, IDs" },
  { id: "signed-agreements",  description: "Booking + handoff PDFs" },
  { id: "condition-photos",   description: "Delivery + return condition photos" },
];

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: existing, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) throw listErr;
  const existingIds = new Set((existing ?? []).map((b) => b.id));

  for (const b of BUCKETS) {
    if (existingIds.has(b.id)) {
      console.log(`✓ ${b.id} — already exists`);
      continue;
    }
    const { error } = await supabase.storage.createBucket(b.id, { public: false });
    if (error) {
      console.error(`✗ ${b.id} — ${error.message}`);
      process.exit(1);
    }
    console.log(`+ ${b.id} — created (${b.description})`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
