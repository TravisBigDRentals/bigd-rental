import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const availabilityQuery = z.object({
  equipment_id: z.string().uuid(),
  start_date: dateString,
  end_date: dateString,
});
export type AvailabilityQuery = z.infer<typeof availabilityQuery>;

export const customerInput = z.object({
  first_name: z.string().min(1).max(60),
  last_name: z.string().min(1).max(60),
  business_name: z.string().max(120).nullable().optional(),
  email: z.string().email(),
  phone: z.string().min(7).max(40),
  drivers_license_front_path: z.string().min(1),
  drivers_license_back_path: z.string().min(1),
  customer_address_line1: z.string().min(1),
  customer_address_line2: z.string().nullable().optional(),
  customer_city: z.string().min(1),
  customer_province: z.string().min(1),
  customer_postal_code: z.string().min(1),
  project_address_line1: z.string().min(1),
  project_address_line2: z.string().nullable().optional(),
  project_city: z.string().min(1),
  project_province: z.string().min(1),
  project_postal_code: z.string().min(1),
});
export type CustomerInput = z.infer<typeof customerInput>;

export const createBookingInput = z.object({
  customer: customerInput,
  booking: z.object({
    equipment_id: z.string().uuid(),
    start_date: dateString,
    end_date: dateString,
    dropoff_time: z.enum(["9:00 AM", "10:00 AM"]),
    special_instructions: z.string().nullable().optional(),
    addon_ids: z.array(z.string().uuid()).default([]),
  }),
});
export type CreateBookingInput = z.infer<typeof createBookingInput>;
