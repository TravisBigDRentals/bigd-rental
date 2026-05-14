import { NextResponse } from "next/server";
import { addDays, parseISO } from "date-fns";
import { availabilityQuery } from "@/lib/bookings/schema";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = availabilityQuery.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }
  const { equipment_id, start_date, end_date } = parsed.data;

  if (parseISO(end_date) < parseISO(start_date)) {
    return NextResponse.json({ error: "end_date before start_date" }, { status: 400 });
  }

  // Apply same one-day inspection buffer as the DB trigger so the UX hint
  // matches what the create endpoint will actually accept.
  const bufferedEnd = isoDate(addDays(parseISO(end_date), 1));
  const bufferedStart = isoDate(addDays(parseISO(start_date), -1));

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, start_date, end_date, status")
    .eq("equipment_id", equipment_id)
    .neq("status", "canceled")
    .lte("start_date", bufferedEnd)
    .gte("end_date", bufferedStart);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    available: (data ?? []).length === 0,
    conflicts: data ?? [],
  });
}
