import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const availabilityQuery = z.object({
  equipment_id: z.string().uuid(),
  start_date: dateString,
  end_date: dateString,
});
export type AvailabilityQuery = z.infer<typeof availabilityQuery>;

export const customerInput = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  phone: z.string().min(7).max(40),
  drivers_license_path: z.string().nullable().optional(),
  project_address_line1: z.string().nullable().optional(),
  project_address_line2: z.string().nullable().optional(),
  project_city: z.string().nullable().optional(),
  project_province: z.string().nullable().optional(),
  project_postal_code: z.string().nullable().optional(),
});
export type CustomerInput = z.infer<typeof customerInput>;

export const createBookingInput = z.object({
  customer: customerInput,
  booking: z.object({
    equipment_id: z.string().uuid(),
    start_date: dateString,
    end_date: dateString,
    dropoff_time: z.string().nullable().optional(),
    special_instructions: z.string().nullable().optional(),
    addon_ids: z.array(z.string().uuid()).default([]),
  }),
});
export type CreateBookingInput = z.infer<typeof createBookingInput>;
