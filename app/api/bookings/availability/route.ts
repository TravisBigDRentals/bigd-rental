import { NextResponse } from "next/server";
import { parseISO } from "date-fns";
import { availabilityQuery } from "@/lib/bookings/schema";
import { findBlockingBookings } from "@/lib/bookings/availability";

export const runtime = "nodejs";

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

  try {
    const conflicts = await findBlockingBookings({
      equipmentId: equipment_id,
      startDate: start_date,
      endDate: end_date,
    });
    return NextResponse.json({
      available: conflicts.length === 0,
      conflicts,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Availability check failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
