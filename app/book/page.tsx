import { listAddons, listEquipment } from "@/lib/bookings/queries";
import { BookingForm } from "./booking-form";

export const metadata = {
  title: "Book Equipment — Big D's Rental Co.",
};

export default async function BookPage() {
  const [equipment, addons] = await Promise.all([listEquipment(), listAddons()]);
  return (
    <main className="flex-1 px-6 py-12 sm:py-16">
      <div className="max-w-3xl mx-auto">
        <header className="mb-10">
          <p className="font-mono text-xs tracking-widest text-muted uppercase">
            Calgary, AB · Construction Equipment Rental
          </p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl font-bold tracking-tight">
            Book Equipment
          </h1>
        </header>
        <BookingForm equipment={equipment} addons={addons} />
      </div>
    </main>
  );
}
