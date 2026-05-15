"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PaymentForm, CreditCard } from "react-square-web-payments-sdk";
import type { Addon, Equipment } from "@/lib/bookings/queries";
import { calculatePricing, formatCents } from "@/lib/pricing";

type Step = 1 | 2 | 3 | 4;
type DropoffTime = "9:00 AM" | "10:00 AM";

type CustomerState = {
  first_name: string;
  last_name: string;
  business_name: string;
  email: string;
  phone: string;
  drivers_license_front_path: string | null;
  drivers_license_back_path: string | null;
  customer_address_line1: string;
  customer_address_line2: string;
  customer_city: string;
  customer_province: string;
  customer_postal_code: string;
  project_address_line1: string;
  project_address_line2: string;
  project_city: string;
  project_province: string;
  project_postal_code: string;
};

const EMPTY_CUSTOMER: CustomerState = {
  first_name: "",
  last_name: "",
  business_name: "",
  email: "",
  phone: "",
  drivers_license_front_path: null,
  drivers_license_back_path: null,
  customer_address_line1: "",
  customer_address_line2: "",
  customer_city: "Calgary",
  customer_province: "AB",
  customer_postal_code: "",
  project_address_line1: "",
  project_address_line2: "",
  project_city: "Calgary",
  project_province: "AB",
  project_postal_code: "",
};

const SQUARE_APP_ID = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID ?? "";
const SQUARE_LOC_ID = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID ?? "";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addOneDay(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function formatLongDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function BookingForm({
  equipment,
  addons,
}: {
  equipment: Equipment[];
  addons: Addon[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [equipmentId, setEquipmentId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(todayISO());
  const [endDate, setEndDate] = useState<string>(todayISO());
  const [dropoffTime, setDropoffTime] = useState<DropoffTime>("9:00 AM");
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [customer, setCustomer] = useState<CustomerState>(EMPTY_CUSTOMER);
  const [specialInstructions, setSpecialInstructions] = useState<string>("");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [uploadingFront, setUploadingFront] = useState(false);
  const [uploadingBack, setUploadingBack] = useState(false);
  const [creatingBooking, setCreatingBooking] = useState(false);
  const [paying, setPaying] = useState(false);

  const selectedEquipment = useMemo(
    () => equipment.find((e) => e.id === equipmentId) ?? null,
    [equipment, equipmentId],
  );

  const compatibleAddons = useMemo(
    () => (selectedEquipment
      ? addons.filter((a) => a.compatible_equipment_type === selectedEquipment.type)
      : []),
    [addons, selectedEquipment],
  );

  const selectedAddons = useMemo(
    () => addons.filter((a) => addonIds.includes(a.id)),
    [addons, addonIds],
  );

  const pricing = useMemo(() => {
    if (!selectedEquipment) return null;
    return calculatePricing({
      startDate,
      endDate,
      equipmentDailyRateCents: selectedEquipment.daily_rate_cents,
      addons: selectedAddons.map((a) => ({
        addonId: a.id,
        dailyRateCents: a.daily_rate_cents,
        quantity: 1,
      })),
    });
  }, [selectedEquipment, selectedAddons, startDate, endDate]);

  const pickupDateISO = useMemo(() => addOneDay(endDate), [endDate]);

  function toggleAddon(id: string) {
    setAddonIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function updateCustomer<K extends keyof CustomerState>(key: K, value: CustomerState[K]) {
    setCustomer((prev) => ({ ...prev, [key]: value }));
  }

  async function lookupReturningCustomer(email: string) {
    if (!email || !email.includes("@")) return;
    try {
      const res = await fetch(`/api/customers/lookup?email=${encodeURIComponent(email)}`);
      const json = await res.json();
      if (json.found && json.customer) {
        setCustomer((prev) => ({
          ...prev,
          first_name: json.customer.first_name ?? prev.first_name,
          last_name: json.customer.last_name ?? prev.last_name,
          business_name: json.customer.business_name ?? prev.business_name,
          phone: json.customer.phone ?? prev.phone,
          customer_address_line1: json.customer.customer_address_line1 ?? prev.customer_address_line1,
          customer_address_line2: json.customer.customer_address_line2 ?? prev.customer_address_line2,
          customer_city: json.customer.customer_city ?? prev.customer_city,
          customer_province: json.customer.customer_province ?? prev.customer_province,
          customer_postal_code: json.customer.customer_postal_code ?? prev.customer_postal_code,
          project_address_line1: json.customer.project_address_line1 ?? prev.project_address_line1,
          project_address_line2: json.customer.project_address_line2 ?? prev.project_address_line2,
          project_city: json.customer.project_city ?? prev.project_city,
          project_province: json.customer.project_province ?? prev.project_province,
          project_postal_code: json.customer.project_postal_code ?? prev.project_postal_code,
        }));
      }
    } catch {
      // Silent — pre-fill is best-effort
    }
  }

  async function uploadDL(file: File | null, side: "front" | "back") {
    if (!file) return;
    const setLoading = side === "front" ? setUploadingFront : setUploadingBack;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/bookings/upload-dl", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Upload failed");
        return;
      }
      if (side === "front") updateCustomer("drivers_license_front_path", json.path);
      else updateCustomer("drivers_license_back_path", json.path);
    } finally {
      setLoading(false);
    }
  }

  async function goToStep2() {
    setError(null);
    if (!equipmentId) return setError("Pick a machine first");
    if (!startDate || !endDate) return setError("Pick start and end dates");
    if (new Date(endDate) < new Date(startDate)) {
      return setError("End date must be on or after start date");
    }

    setCheckingAvailability(true);
    try {
      const res = await fetch("/api/bookings/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equipment_id: equipmentId, start_date: startDate, end_date: endDate }),
      });
      const json = await res.json();
      if (!res.ok) return setError(json.error ?? "Availability check failed");
      if (!json.available) {
        return setError("That machine is already booked on those dates. Try different dates or a different machine.");
      }
      setStep(2);
    } finally {
      setCheckingAvailability(false);
    }
  }

  function goToStep3() {
    setError(null);
    if (!customer.first_name.trim()) return setError("First name is required");
    if (!customer.last_name.trim()) return setError("Last name is required");
    if (!customer.email.trim()) return setError("Email is required");
    if (!customer.phone.trim()) return setError("Phone is required");
    if (!customer.drivers_license_front_path) return setError("Driver's license (front) is required");
    if (!customer.drivers_license_back_path) return setError("Driver's license (back) is required");
    if (!customer.customer_address_line1.trim()) return setError("Customer address is required");
    if (!customer.customer_city.trim()) return setError("Customer city is required");
    if (!customer.customer_province.trim()) return setError("Customer province is required");
    if (!customer.customer_postal_code.trim()) return setError("Customer postal code is required");
    if (!customer.project_address_line1.trim()) return setError("Project address is required");
    if (!customer.project_city.trim()) return setError("Project city is required");
    if (!customer.project_province.trim()) return setError("Project province is required");
    if (!customer.project_postal_code.trim()) return setError("Project postal code is required");
    setStep(3);
  }

  async function createBookingAndAdvanceToPay() {
    setError(null);
    if (bookingId) {
      setStep(4);
      return;
    }
    setCreatingBooking(true);
    try {
      const res = await fetch("/api/bookings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: {
            first_name: customer.first_name.trim(),
            last_name: customer.last_name.trim(),
            business_name: customer.business_name.trim() || null,
            email: customer.email.trim().toLowerCase(),
            phone: customer.phone.trim(),
            drivers_license_front_path: customer.drivers_license_front_path,
            drivers_license_back_path: customer.drivers_license_back_path,
            customer_address_line1: customer.customer_address_line1.trim(),
            customer_address_line2: customer.customer_address_line2.trim() || null,
            customer_city: customer.customer_city.trim(),
            customer_province: customer.customer_province.trim(),
            customer_postal_code: customer.customer_postal_code.trim(),
            project_address_line1: customer.project_address_line1.trim(),
            project_address_line2: customer.project_address_line2.trim() || null,
            project_city: customer.project_city.trim(),
            project_province: customer.project_province.trim(),
            project_postal_code: customer.project_postal_code.trim(),
          },
          booking: {
            equipment_id: equipmentId,
            start_date: startDate,
            end_date: endDate,
            dropoff_time: dropoffTime,
            special_instructions: specialInstructions.trim() || null,
            addon_ids: addonIds,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Booking failed");
        return;
      }
      setBookingId(json.booking_id);
      setStep(4);
    } finally {
      setCreatingBooking(false);
    }
  }

  async function handlePaymentToken(sourceId: string) {
    if (!bookingId) {
      setError("Missing booking ID — go back and re-submit");
      return;
    }
    setPaying(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: bookingId, source_id: sourceId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Payment failed");
        return;
      }
      router.push(`/book/confirmed?id=${bookingId}`);
    } finally {
      setPaying(false);
    }
  }

  return (
    <div>
      <StepIndicator step={step} />

      {error && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      )}

      {step === 1 && (
        <StepConfigure
          equipment={equipment}
          equipmentId={equipmentId}
          setEquipmentId={(id) => { setEquipmentId(id); setAddonIds([]); }}
          startDate={startDate} setStartDate={setStartDate}
          endDate={endDate} setEndDate={setEndDate}
          pickupDate={pickupDateISO}
          dropoffTime={dropoffTime} setDropoffTime={setDropoffTime}
          compatibleAddons={compatibleAddons}
          addonIds={addonIds} toggleAddon={toggleAddon}
          pricing={pricing}
          onNext={goToStep2} loading={checkingAvailability}
        />
      )}

      {step === 2 && (
        <StepCustomer
          customer={customer} updateCustomer={updateCustomer}
          onEmailBlur={lookupReturningCustomer}
          onDLFrontChange={(f) => uploadDL(f, "front")}
          onDLBackChange={(f) => uploadDL(f, "back")}
          uploadingFront={uploadingFront} uploadingBack={uploadingBack}
          onBack={() => setStep(1)} onNext={goToStep3}
        />
      )}

      {step === 3 && pricing && selectedEquipment && (
        <StepReview
          equipment={selectedEquipment}
          startDate={startDate} endDate={endDate} pickupDate={pickupDateISO}
          dropoffTime={dropoffTime} addons={selectedAddons}
          customer={customer}
          specialInstructions={specialInstructions}
          setSpecialInstructions={setSpecialInstructions}
          pricing={pricing}
          onBack={() => setStep(2)} onNext={createBookingAndAdvanceToPay}
          submitting={creatingBooking}
        />
      )}

      {step === 4 && pricing && (
        <StepPay totalCents={pricing.totalCents}
          applicationId={SQUARE_APP_ID} locationId={SQUARE_LOC_ID}
          paying={paying} onPaymentToken={handlePaymentToken}
          onBack={() => setStep(3)} />
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const labels = ["Configure", "Your info", "Review", "Pay"];
  return (
    <ol className="mb-10 flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-widest">
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        const active = step === n;
        const done = step > n;
        return (
          <li key={label} className="flex items-center gap-2">
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${
              active ? "bg-accent text-paper"
                : done ? "bg-ink text-paper"
                : "border border-ink/20 text-muted"
            }`}>
              {done ? "✓" : n}
            </span>
            <span className={active || done ? "text-ink" : "text-muted"}>{label}</span>
            {i < labels.length - 1 && <span className="mx-2 text-muted">·</span>}
          </li>
        );
      })}
    </ol>
  );
}

// --- Step 1: Configure ------------------------------------------------------

function StepConfigure(props: {
  equipment: Equipment[];
  equipmentId: string;
  setEquipmentId: (id: string) => void;
  startDate: string; setStartDate: (d: string) => void;
  endDate: string; setEndDate: (d: string) => void;
  pickupDate: string;
  dropoffTime: DropoffTime; setDropoffTime: (t: DropoffTime) => void;
  compatibleAddons: Addon[];
  addonIds: string[]; toggleAddon: (id: string) => void;
  pricing: ReturnType<typeof calculatePricing> | null;
  onNext: () => void; loading: boolean;
}) {
  const {
    equipment, equipmentId, setEquipmentId,
    startDate, setStartDate, endDate, setEndDate, pickupDate,
    dropoffTime, setDropoffTime,
    compatibleAddons, addonIds, toggleAddon,
    pricing, onNext, loading,
  } = props;

  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-display text-2xl font-semibold">Pick a machine</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {equipment.map((eq) => {
            const selected = equipmentId === eq.id;
            return (
              <button key={eq.id} type="button" onClick={() => setEquipmentId(eq.id)}
                className={`text-left rounded-2xl border p-5 transition-colors ${
                  selected ? "border-accent bg-accent/5" : "border-ink/15 hover:border-ink/30 bg-paper"
                }`}>
                <p className="font-display text-lg font-semibold">{eq.name}</p>
                <p className="mt-1 font-mono text-xs text-muted">{eq.serial}</p>
                <p className="mt-3 text-sm">
                  <span className="font-mono">{formatCents(eq.daily_rate_cents)}</span>
                  <span className="text-muted"> / day</span>
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="font-display text-2xl font-semibold">Rental dates</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="block text-sm font-medium">Delivery date</span>
            <input type="date" value={startDate} min={todayISO()}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" />
          </label>
          <label className="block">
            <span className="block text-sm font-medium">End date</span>
            <input type="date" value={endDate} min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" />
          </label>
          <label className="block">
            <span className="block text-sm font-medium">Drop-off time</span>
            <select value={dropoffTime}
              onChange={(e) => setDropoffTime(e.target.value as DropoffTime)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2">
              <option>9:00 AM</option>
              <option>10:00 AM</option>
            </select>
          </label>
        </div>
        {pickupDate && (
          <div className="mt-4 rounded-lg border border-ink/15 bg-ink/[0.03] px-4 py-3 flex items-center gap-3">
            <span className="text-lg" aria-hidden>📅</span>
            <p className="text-sm">
              <span className="text-muted">Equipment pickup: </span>
              <span className="font-medium">{formatLongDate(pickupDate)}</span>
              <span className="text-muted"> at {dropoffTime}</span>
            </p>
          </div>
        )}
      </div>

      {equipmentId && compatibleAddons.length > 0 && (
        <div>
          <h2 className="font-display text-2xl font-semibold">Attachments</h2>
          <p className="mt-1 text-sm text-muted">
            First attachment is free. Each additional attachment is{" "}
            {formatCents(compatibleAddons[0]?.daily_rate_cents ?? 4000)}/day.
          </p>
          <div className="mt-4 space-y-2">
            {compatibleAddons.map((addon) => {
              const checked = addonIds.includes(addon.id);
              return (
                <label key={addon.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                    checked ? "border-accent bg-accent/5" : "border-ink/15 hover:border-ink/30"
                  }`}>
                  <span className="flex items-center gap-3">
                    <input type="checkbox" checked={checked}
                      onChange={() => toggleAddon(addon.id)}
                      className="h-4 w-4 accent-[var(--color-accent)]" />
                    <span>{addon.name}</span>
                  </span>
                  <span className="font-mono text-sm text-muted">
                    {formatCents(addon.daily_rate_cents)}/day
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {pricing && (
        <div className="rounded-2xl border border-ink/10 bg-ink/[0.02] p-5">
          <p className="font-mono text-xs uppercase tracking-widest text-muted">
            Estimated total · {pricing.days} day{pricing.days === 1 ? "" : "s"}
          </p>
          <p className="mt-1 font-display text-3xl font-bold">{formatCents(pricing.totalCents)}</p>
        </div>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={onNext} disabled={loading || !equipmentId}
          className="rounded-full bg-accent px-6 py-3 text-paper font-medium hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 transition-colors">
          {loading ? "Checking availability…" : "Next: your info →"}
        </button>
      </div>
    </section>
  );
}

// --- Step 2: Customer info --------------------------------------------------

function StepCustomer(props: {
  customer: CustomerState;
  updateCustomer: <K extends keyof CustomerState>(key: K, value: CustomerState[K]) => void;
  onEmailBlur: (email: string) => void;
  onDLFrontChange: (file: File | null) => void;
  onDLBackChange: (file: File | null) => void;
  uploadingFront: boolean;
  uploadingBack: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const {
    customer, updateCustomer, onEmailBlur,
    onDLFrontChange, onDLBackChange,
    uploadingFront, uploadingBack,
    onBack, onNext,
  } = props;

  return (
    <section className="space-y-10">
      <div>
        <h2 className="font-display text-2xl font-semibold">Your info</h2>
        <p className="mt-1 text-sm text-muted">All fields marked * are required.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="First name *">
            <input type="text" value={customer.first_name}
              onChange={(e) => updateCustomer("first_name", e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" required />
          </Field>
          <Field label="Last name *">
            <input type="text" value={customer.last_name}
              onChange={(e) => updateCustomer("last_name", e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" required />
          </Field>
          <Field label="ATTN / Business (optional)" className="sm:col-span-2">
            <input type="text" value={customer.business_name}
              onChange={(e) => updateCustomer("business_name", e.target.value)}
              placeholder="Smith Excavation Ltd."
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" />
          </Field>
          <Field label="Email *">
            <input type="email" value={customer.email}
              onChange={(e) => updateCustomer("email", e.target.value)}
              onBlur={(e) => onEmailBlur(e.target.value.trim().toLowerCase())}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" required />
          </Field>
          <Field label="Phone *">
            <input type="tel" value={customer.phone}
              onChange={(e) => updateCustomer("phone", e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" required />
          </Field>
        </div>
      </div>

      <div>
        <h2 className="font-display text-2xl font-semibold">Driver&rsquo;s license</h2>
        <p className="mt-1 text-sm text-muted">Photo or PDF, both sides. Max 10 MB each.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <DLDropZone label="LICENSE FRONT" uploaded={!!customer.drivers_license_front_path}
            uploading={uploadingFront} onChange={onDLFrontChange} side="Front" />
          <DLDropZone label="LICENSE BACK" uploaded={!!customer.drivers_license_back_path}
            uploading={uploadingBack} onChange={onDLBackChange} side="Back" />
        </div>
      </div>

      <div>
        <h2 className="font-display text-2xl font-semibold">Customer address</h2>
        <p className="mt-1 text-sm text-muted">Your home or business address.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Address line 1 *" className="sm:col-span-2">
            <input type="text" value={customer.customer_address_line1}
              onChange={(e) => updateCustomer("customer_address_line1", e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" required />
          </Field>
          <Field label="Address line 2 (optional)" className="sm:col-span-2">
            <input type="text" value={customer.customer_address_line2}
              onChange={(e) => updateCustomer("customer_address_line2", e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" />
          </Field>
          <Field label="City *">
            <input type="text" value={customer.customer_city}
              onChange={(e) => updateCustomer("customer_city", e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" required />
          </Field>
          <Field label="Province *">
            <input type="text" value={customer.customer_province}
              onChange={(e) => updateCustomer("customer_province", e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" required />
          </Field>
          <Field label="Postal code *">
            <input type="text" value={customer.customer_postal_code}
              onChange={(e) => updateCustomer("customer_postal_code", e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" required />
          </Field>
        </div>
      </div>

      <div>
        <h2 className="font-display text-2xl font-semibold">Project address</h2>
        <p className="mt-1 text-sm text-muted">Where the equipment will be used (job site).</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Address line 1 *" className="sm:col-span-2">
            <input type="text" value={customer.project_address_line1}
              onChange={(e) => updateCustomer("project_address_line1", e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" required />
          </Field>
          <Field label="Address line 2 (optional)" className="sm:col-span-2">
            <input type="text" value={customer.project_address_line2}
              onChange={(e) => updateCustomer("project_address_line2", e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" />
          </Field>
          <Field label="City *">
            <input type="text" value={customer.project_city}
              onChange={(e) => updateCustomer("project_city", e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" required />
          </Field>
          <Field label="Province *">
            <input type="text" value={customer.project_province}
              onChange={(e) => updateCustomer("project_province", e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" required />
          </Field>
          <Field label="Postal code *">
            <input type="text" value={customer.project_postal_code}
              onChange={(e) => updateCustomer("project_postal_code", e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" required />
          </Field>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack}
          className="rounded-full border border-ink/15 px-6 py-3 font-medium hover:bg-ink/5 transition-colors">
          ← Back
        </button>
        <button type="button" onClick={onNext}
          className="rounded-full bg-accent px-6 py-3 text-paper font-medium hover:bg-accent-hover transition-colors">
          Next: review →
        </button>
      </div>
    </section>
  );
}

function DLDropZone({
  label, side, uploaded, uploading, onChange,
}: {
  label: string; side: string;
  uploaded: boolean; uploading: boolean;
  onChange: (file: File | null) => void;
}) {
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-muted">{label} *</p>
      <label className={`mt-2 flex h-32 flex-col items-center justify-center rounded-2xl border-2 border-dashed cursor-pointer transition-colors ${
        uploaded
          ? "border-accent bg-accent/5"
          : "border-ink/20 hover:border-accent/60 hover:bg-accent/[0.03]"
      }`}>
        <input
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
        {uploading ? (
          <p className="text-sm text-muted">Uploading…</p>
        ) : uploaded ? (
          <>
            <span className="text-2xl text-accent" aria-hidden>✓</span>
            <p className="mt-1 text-sm font-medium text-accent">Uploaded</p>
            <p className="text-xs text-muted">Click to replace</p>
          </>
        ) : (
          <>
            <span className="text-3xl text-accent leading-none" aria-hidden>+</span>
            <p className="mt-2 text-sm text-ink/70">Upload License {side}</p>
          </>
        )}
      </label>
    </div>
  );
}

function Field({ label, className = "", children }: {
  label: string; className?: string; children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

// --- Step 3: Review ---------------------------------------------------------

function StepReview(props: {
  equipment: Equipment;
  startDate: string; endDate: string; pickupDate: string;
  dropoffTime: DropoffTime;
  addons: Addon[];
  customer: CustomerState;
  specialInstructions: string;
  setSpecialInstructions: (s: string) => void;
  pricing: ReturnType<typeof calculatePricing>;
  onBack: () => void;
  onNext: () => void;
  submitting: boolean;
}) {
  const {
    equipment, startDate, endDate, pickupDate, dropoffTime, addons, customer,
    specialInstructions, setSpecialInstructions, pricing,
    onBack, onNext, submitting,
  } = props;

  const customerFullAddress = [
    customer.customer_address_line1,
    customer.customer_address_line2,
    customer.customer_city,
    customer.customer_province,
    customer.customer_postal_code,
  ].filter(Boolean).join(", ");

  const projectFullAddress = [
    customer.project_address_line1,
    customer.project_address_line2,
    customer.project_city,
    customer.project_province,
    customer.project_postal_code,
  ].filter(Boolean).join(", ");

  const agreementDate = formatLongDate(todayISO());

  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-display text-2xl font-semibold">Review your booking</h2>
        <p className="mt-1 text-sm text-muted">
          Confirm everything looks right before proceeding to payment.
        </p>
      </div>

      <div className="rounded-2xl border border-ink/10 bg-ink/[0.02] divide-y divide-ink/10">
        <ReviewRow
          left={{ label: "Customer name", value: `${customer.first_name} ${customer.last_name}` }}
          right={{ label: "Date of agreement", value: agreementDate }}
        />
        <ReviewRow
          left={{ label: "ATTN / Business", value: customer.business_name || "—" }}
          right={{ label: "Phone", value: customer.phone }}
        />
        <ReviewRow
          left={{ label: "Email", value: customer.email }}
          right={{ label: "Delivery date", value: formatLongDate(startDate) }}
        />
        <ReviewRow
          left={{ label: "Customer address", value: customerFullAddress }}
          right={{ label: "Pickup date", value: formatLongDate(pickupDate) }}
        />
        <ReviewRow
          left={{ label: "Project address", value: projectFullAddress }}
          right={{ label: "Drop-off time", value: dropoffTime }}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SummaryBlock title="Equipment">
          <p className="font-medium">{equipment.name}</p>
          <p className="font-mono text-xs text-muted">{equipment.serial}</p>
        </SummaryBlock>
        {addons.length > 0 ? (
          <SummaryBlock title="Attachments">
            <ul className="text-sm space-y-0.5">
              {addons.map((a, i) => (
                <li key={a.id} className="flex justify-between">
                  <span>{a.name}</span>
                  <span className="font-mono text-muted">
                    {i === 0 ? "Free" : `${formatCents(a.daily_rate_cents)}/day`}
                  </span>
                </li>
              ))}
            </ul>
          </SummaryBlock>
        ) : (
          <SummaryBlock title="Attachments"><p className="text-sm text-muted">None</p></SummaryBlock>
        )}
      </div>

      <div>
        <label className="block">
          <span className="block text-sm font-medium">Special instructions (optional)</span>
          <textarea value={specialInstructions} rows={3}
            onChange={(e) => setSpecialInstructions(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2"
            placeholder="Gate code, contact on site, etc." />
        </label>
      </div>

      <div className="rounded-2xl border border-ink/10 bg-ink/[0.02] p-5 space-y-2">
        <div className="flex justify-between">
          <span className="text-sm">{equipment.name} × {pricing.days} day{pricing.days === 1 ? "" : "s"}</span>
          <span className="font-mono">{formatCents(pricing.equipmentCents)}</span>
        </div>
        {pricing.addonsCents > 0 && (
          <div className="flex justify-between">
            <span className="text-sm">Attachments × {pricing.days} day{pricing.days === 1 ? "" : "s"}</span>
            <span className="font-mono">{formatCents(pricing.addonsCents)}</span>
          </div>
        )}
        <div className="border-t border-ink/10 pt-2 flex justify-between font-display text-xl font-semibold">
          <span>Total</span>
          <span>{formatCents(pricing.totalCents)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack}
          className="rounded-full border border-ink/15 px-6 py-3 font-medium hover:bg-ink/5 transition-colors">
          ← Back
        </button>
        <button type="button" onClick={onNext} disabled={submitting}
          className="rounded-full bg-accent px-8 py-3 text-paper font-medium hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 transition-colors">
          {submitting ? "Saving booking…" : "Continue to payment →"}
        </button>
      </div>
    </section>
  );
}

function ReviewRow({
  left, right,
}: {
  left: { label: string; value: string };
  right: { label: string; value: string };
}) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 px-5 py-4">
      <ReviewCell label={left.label} value={left.value} />
      <ReviewCell label={right.label} value={right.value} />
    </div>
  );
}

function ReviewCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-1 text-sm leading-snug">{value || "—"}</p>
    </div>
  );
}

function SummaryBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink/10 p-4">
      <p className="font-mono text-xs uppercase tracking-widest text-muted">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

// --- Step 4: Pay ------------------------------------------------------------

function StepPay({
  totalCents, applicationId, locationId, paying,
  onPaymentToken, onBack,
}: {
  totalCents: number;
  applicationId: string;
  locationId: string;
  paying: boolean;
  onPaymentToken: (sourceId: string) => void;
  onBack: () => void;
}) {
  if (!applicationId || !locationId) {
    return (
      <section className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
        <p className="font-medium">Square is not configured for this environment.</p>
        <p className="mt-1">
          The site is missing <code>NEXT_PUBLIC_SQUARE_APPLICATION_ID</code> or{" "}
          <code>NEXT_PUBLIC_SQUARE_LOCATION_ID</code>. Add them in the Vercel project settings
          (or your local <code>.env.local</code>) and redeploy.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">Payment</h2>
        <p className="mt-1 text-sm text-muted">
          Card details are tokenized by Square directly — they never touch our servers.
        </p>
      </div>

      <div className="rounded-2xl border border-ink/10 bg-ink/[0.02] p-5">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">Amount due</p>
        <p className="mt-1 font-display text-3xl font-bold">{formatCents(totalCents)}</p>
      </div>

      <div className="rounded-2xl border border-ink/10 p-5">
        <PaymentForm
          applicationId={applicationId}
          locationId={locationId}
          cardTokenizeResponseReceived={async (tokenResult) => {
            if (tokenResult.status !== "OK" || !tokenResult.token) return;
            onPaymentToken(tokenResult.token);
          }}
          createPaymentRequest={() => ({
            countryCode: "CA",
            currencyCode: "CAD",
            total: { amount: (totalCents / 100).toFixed(2), label: "Total" },
          })}
        >
          <CreditCard
            buttonProps={{
              isLoading: paying,
              css: {
                backgroundColor: "var(--color-accent)",
                fontSize: "16px",
                fontWeight: 500,
                "&:hover": { backgroundColor: "var(--color-accent-hover)" },
              },
            }}
          >
            {paying ? "Processing…" : `Pay ${formatCents(totalCents)}`}
          </CreditCard>
        </PaymentForm>
      </div>

      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} disabled={paying}
          className="rounded-full border border-ink/15 px-6 py-3 font-medium hover:bg-ink/5 disabled:opacity-50 transition-colors">
          ← Back
        </button>
        <p className="font-mono text-xs text-muted">
          Sandbox test card: 4111 1111 1111 1111 · any future expiry · CVV 111
        </p>
      </div>
    </section>
  );
}
