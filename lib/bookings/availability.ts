import "server-only";
import { addDays, parseISO } from "date-fns";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// Status sets that decide whether a row blocks dates. Must stay in
// sync with check_double_booking() in migration 0016.
const PAID_STATUSES = new Set(["booked", "delivered", "returned", "closed"]);
const PENDING_STATUSES = new Set(["pending_signature", "pending_payment"]);
const HOLD_MS = 15 * 60 * 1000;

export type BookingRow = {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
  equipment_id: string;
  extra_equipment_id: string | null;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Returns rows that actively block the given equipment over the given
// window. Paid statuses always block; pending statuses only within their
// 15-minute hold. Mirror of the DB trigger logic.
export async function findBlockingBookings(opts: {
  equipmentId: string;
  startDate: string;
  endDate: string;
  excludeBookingId?: string;
}): Promise<BookingRow[]> {
  const { equipmentId, startDate, endDate, excludeBookingId } = opts;
  // Same one-day inspection buffer as the trigger.
  const bufferedEnd = isoDate(addDays(parseISO(endDate), 1));
  const bufferedStart = isoDate(addDays(parseISO(startDate), -1));
  const holdCutoff = new Date(Date.now() - HOLD_MS);

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, start_date, end_date, status, created_at, equipment_id, extra_equipment_id")
    .or(`equipment_id.eq.${equipmentId},extra_equipment_id.eq.${equipmentId}`)
    .neq("status", "canceled")
    .lte("start_date", bufferedEnd)
    .gte("end_date", bufferedStart);

  if (error) throw error;

  return (data ?? [])
    .filter((b) => !excludeBookingId || b.id !== excludeBookingId)
    .filter((b) => {
      if (PAID_STATUSES.has(b.status)) return true;
      if (PENDING_STATUSES.has(b.status)) {
        return new Date(b.created_at) > holdCutoff;
      }
      return false;
    }) as BookingRow[];
}
