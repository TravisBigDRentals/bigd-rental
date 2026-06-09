import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { sendAbandonedCartEmailIfDue } from "@/lib/email/abandoned-cart";

export const runtime = "nodejs";
export const maxDuration = 60;

// Called every 5 minutes by Vercel Cron (see vercel.json). Finds
// bookings that:
//   1) are stuck in pending_signature or pending_payment
//   2) were created more than 15 minutes ago (the hold has expired)
//   3) haven't been emailed yet
// and fires one abandoned-cart email per row.
//
// Cron requests carry `Authorization: Bearer ${CRON_SECRET}`. We refuse
// anything without it so this isn't an internet-callable endpoint.
export async function GET(req: Request) {
  const h = await headers();
  const auth = h.get("authorization") ?? h.get("Authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id")
    .in("status", ["pending_signature", "pending_payment"])
    .is("abandoned_email_sent_at", null)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Resolve the public base URL — Vercel injects VERCEL_URL on prod
  // deploys, but it's the *deployment*-specific URL. Prefer the
  // canonical site URL if you've set NEXT_PUBLIC_SITE_URL in env;
  // otherwise we fall back to the host header (the cron call lands on
  // the production alias).
  const fromHostHeader = (() => {
    const host = h.get("host");
    if (!host) return null;
    const proto = host.startsWith("localhost") ? "http" : "https";
    return `${proto}://${host}`;
  })();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? fromHostHeader ?? "https://example.com";

  const results = await Promise.all(
    (data ?? []).map((row) => sendAbandonedCartEmailIfDue(row.id, baseUrl)),
  );
  const sent = results.filter((r) => r.sent).length;
  const skipped = results.length - sent;
  return NextResponse.json({ scanned: results.length, sent, skipped });
}

// Allow POST from Vercel Cron (it sends GET by default but doesn't hurt).
export const POST = GET;
