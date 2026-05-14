"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Addon, Equipment } from "@/lib/bookings/queries";
import { calculatePricing, formatCents } from "@/lib/pricing";

type Step = 1 | 2 | 3;

type CustomerState = {
  name: string;
  email: string;
  phone: string;
  drivers_license_path: string | null;
  project_address_line1: string;
  project_address_line2: string;
  project_city: string;
  project_province: string;
  project_postal_code: string;
};

const EMPTY_CUSTOMER: CustomerState = {
  name: "",
  email: "",
  phone: "",
  drivers_license_path: null,
  project_address_line1: "",
  project_address_line2: "",
  project_city: "Calgary",
  project_province: "AB",
  project_postal_code: "",
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
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
  const [dropoffTime, setDropoffTime] = useState<string>("9:00 AM");
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [customer, setCustomer] = useState<CustomerState>(EMPTY_CUSTOMER);
  const [specialInstructions, setSpecialInstructions] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [uploadingDL, setUploadingDL] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
          name: json.customer.name ?? prev.name,
          phone: json.customer.phone ?? prev.phone,
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

  async function handleDLChange(file: File | null) {
    if (!file) return;
    setUploadingDL(true);
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
      updateCustomer("drivers_license_path", json.path);
    } finally {
      setUploadingDL(false);
    }
  }

  async function goToStep2() {
    setError(null);
    if (!equipmentId) {
      setError("Pick a machine first");
      return;
    }
    if (!startDate || !endDate) {
      setError("Pick start and end dates");
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError("End date must be on or after start date");
      return;
    }

    setCheckingAvailability(true);
    try {
      const res = await fetch("/api/bookings/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipment_id: equipmentId,
          start_date: startDate,
          end_date: endDate,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Availability check failed");
        return;
      }
      if (!json.available) {
        setError("That machine is already booked on those dates. Try different dates or a different machine.");
        return;
      }
      setStep(2);
    } finally {
      setCheckingAvailability(false);
    }
  }

  function goToStep3() {
    setError(null);
    if (!customer.name.trim()) return setError("Name is required");
    if (!customer.email.trim()) return setError("Email is required");
    if (!customer.phone.trim()) return setError("Phone is required");
    if (!customer.drivers_license_path) return setError("Driver's license upload is required");
    setStep(3);
  }

  async function submitBooking() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/bookings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: {
            name: customer.name.trim(),
            email: customer.email.trim().toLowerCase(),
            phone: customer.phone.trim(),
            drivers_license_path: customer.drivers_license_path,
            project_address_line1: customer.project_address_line1.trim() || null,
            project_address_line2: customer.project_address_line2.trim() || null,
            project_city: customer.project_city.trim() || null,
            project_province: customer.project_province.trim() || null,
            project_postal_code: customer.project_postal_code.trim() || null,
          },
          booking: {
            equipment_id: equipmentId,
            start_date: startDate,
            end_date: endDate,
            dropoff_time: dropoffTime || null,
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
      router.push(`/book/confirmed?id=${json.booking_id}`);
    } finally {
      setSubmitting(false);
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
          setEquipmentId={(id) => {
            setEquipmentId(id);
            setAddonIds([]); // reset addons when equipment changes
          }}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          dropoffTime={dropoffTime}
          setDropoffTime={setDropoffTime}
          compatibleAddons={compatibleAddons}
          addonIds={addonIds}
          toggleAddon={toggleAddon}
          pricing={pricing}
          onNext={goToStep2}
          loading={checkingAvailability}
        />
      )}

      {step === 2 && (
        <StepCustomer
          customer={customer}
          updateCustomer={updateCustomer}
          onEmailBlur={lookupReturningCustomer}
          onDLChange={handleDLChange}
          uploadingDL={uploadingDL}
          onBack={() => setStep(1)}
          onNext={goToStep3}
        />
      )}

      {step === 3 && pricing && selectedEquipment && (
        <StepReview
          equipment={selectedEquipment}
          startDate={startDate}
          endDate={endDate}
          dropoffTime={dropoffTime}
          addons={selectedAddons}
          customer={customer}
          specialInstructions={specialInstructions}
          setSpecialInstructions={setSpecialInstructions}
          pricing={pricing}
          onBack={() => setStep(2)}
          onSubmit={submitBooking}
          submitting={submitting}
        />
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const labels = ["Configure", "Your info", "Review"];
  return (
    <ol className="mb-10 flex items-center gap-2 font-mono text-xs uppercase tracking-widest">
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        const active = step === n;
        const done = step > n;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${
                active
                  ? "bg-accent text-paper"
                  : done
                    ? "bg-ink text-paper"
                    : "border border-ink/20 text-muted"
              }`}
            >
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

// --- Step 1 -----------------------------------------------------------------

function StepConfigure(props: {
  equipment: Equipment[];
  equipmentId: string;
  setEquipmentId: (id: string) => void;
  startDate: string;
  setStartDate: (d: string) => void;
  endDate: string;
  setEndDate: (d: string) => void;
  dropoffTime: string;
  setDropoffTime: (t: string) => void;
  compatibleAddons: Addon[];
  addonIds: string[];
  toggleAddon: (id: string) => void;
  pricing: ReturnType<typeof calculatePricing> | null;
  onNext: () => void;
  loading: boolean;
}) {
  const {
    equipment, equipmentId, setEquipmentId,
    startDate, setStartDate, endDate, setEndDate,
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
              <button
                key={eq.id}
                type="button"
                onClick={() => setEquipmentId(eq.id)}
                className={`text-left rounded-2xl border p-5 transition-colors ${
                  selected
                    ? "border-accent bg-accent/5"
                    : "border-ink/15 hover:border-ink/30 bg-paper"
                }`}
              >
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
            <span className="block text-sm font-medium">Start date</span>
            <input
              type="date"
              value={startDate}
              min={todayISO()}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium">End date</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium">Drop-off time</span>
            <select
              value={dropoffTime}
              onChange={(e) => setDropoffTime(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2"
            >
              {["7:00 AM", "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>
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
                <label
                  key={addon.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                    checked ? "border-accent bg-accent/5" : "border-ink/15 hover:border-ink/30"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAddon(addon.id)}
                      className="h-4 w-4 accent-[var(--color-accent)]"
                    />
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
          <p className="mt-1 font-display text-3xl font-bold">
            {formatCents(pricing.totalCents)}
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onNext}
          disabled={loading || !equipmentId}
          className="rounded-full bg-accent px-6 py-3 text-paper font-medium hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {loading ? "Checking availability…" : "Next: your info →"}
        </button>
      </div>
    </section>
  );
}

// --- Step 2 -----------------------------------------------------------------

function StepCustomer(props: {
  customer: CustomerState;
  updateCustomer: <K extends keyof CustomerState>(key: K, value: CustomerState[K]) => void;
  onEmailBlur: (email: string) => void;
  onDLChange: (file: File | null) => void;
  uploadingDL: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const { customer, updateCustomer, onEmailBlur, onDLChange, uploadingDL, onBack, onNext } = props;

  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-display text-2xl font-semibold">Your info</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <input
              type="text"
              value={customer.name}
              onChange={(e) => updateCustomer("name", e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2"
              required
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={customer.email}
              onChange={(e) => updateCustomer("email", e.target.value)}
              onBlur={(e) => onEmailBlur(e.target.value.trim().toLowerCase())}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2"
              required
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={customer.phone}
              onChange={(e) => updateCustomer("phone", e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2"
              required
            />
          </Field>
          <Field label="Driver's license">
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => onDLChange(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm"
            />
            {uploadingDL && <p className="mt-1 text-xs text-muted">Uploading…</p>}
            {customer.drivers_license_path && !uploadingDL && (
              <p className="mt-1 font-mono text-xs text-muted">✓ Uploaded</p>
            )}
          </Field>
        </div>
      </div>

      <div>
        <h2 className="font-display text-2xl font-semibold">Project address</h2>
        <p className="mt-1 text-sm text-muted">Where will the equipment be used?</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Address line 1" className="sm:col-span-2">
            <input
              type="text"
              value={customer.project_address_line1}
              onChange={(e) => updateCustomer("project_address_line1", e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2"
            />
          </Field>
          <Field label="Address line 2 (optional)" className="sm:col-span-2">
            <input
              type="text"
              value={customer.project_address_line2}
              onChange={(e) => updateCustomer("project_address_line2", e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2"
            />
          </Field>
          <Field label="City">
            <input
              type="text"
              value={customer.project_city}
              onChange={(e) => updateCustomer("project_city", e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2"
            />
          </Field>
          <Field label="Province">
            <input
              type="text"
              value={customer.project_province}
              onChange={(e) => updateCustomer("project_province", e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2"
            />
          </Field>
          <Field label="Postal code">
            <input
              type="text"
              value={customer.project_postal_code}
              onChange={(e) => updateCustomer("project_postal_code", e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2"
            />
          </Field>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-ink/15 px-6 py-3 font-medium hover:bg-ink/5 transition-colors"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-full bg-accent px-6 py-3 text-paper font-medium hover:bg-accent-hover transition-colors"
        >
          Next: review →
        </button>
      </div>
    </section>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

// --- Step 3 -----------------------------------------------------------------

function StepReview(props: {
  equipment: Equipment;
  startDate: string;
  endDate: string;
  dropoffTime: string;
  addons: Addon[];
  customer: CustomerState;
  specialInstructions: string;
  setSpecialInstructions: (s: string) => void;
  pricing: ReturnType<typeof calculatePricing>;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const {
    equipment, startDate, endDate, dropoffTime, addons, customer,
    specialInstructions, setSpecialInstructions, pricing,
    onBack, onSubmit, submitting,
  } = props;

  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-display text-2xl font-semibold">Review your booking</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <SummaryBlock title="Equipment">
            <p className="font-medium">{equipment.name}</p>
            <p className="font-mono text-xs text-muted">{equipment.serial}</p>
          </SummaryBlock>
          <SummaryBlock title="Dates">
            <p>{startDate} → {endDate}</p>
            <p className="text-sm text-muted">Drop-off at {dropoffTime}</p>
          </SummaryBlock>
          {addons.length > 0 && (
            <SummaryBlock title="Attachments" className="sm:col-span-2">
              <ul className="text-sm">
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
          )}
          <SummaryBlock title="Contact" className="sm:col-span-2">
            <p>{customer.name}</p>
            <p className="text-sm text-muted">{customer.email}</p>
            <p className="text-sm text-muted">{customer.phone}</p>
          </SummaryBlock>
          {customer.project_address_line1 && (
            <SummaryBlock title="Project address" className="sm:col-span-2">
              <p>{customer.project_address_line1}</p>
              {customer.project_address_line2 && <p>{customer.project_address_line2}</p>}
              <p>
                {[customer.project_city, customer.project_province, customer.project_postal_code]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </SummaryBlock>
          )}
        </div>
      </div>

      <div>
        <label className="block">
          <span className="block text-sm font-medium">Special instructions (optional)</span>
          <textarea
            value={specialInstructions}
            onChange={(e) => setSpecialInstructions(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2"
            placeholder="Gate code, contact on site, etc."
          />
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
        <p className="text-xs text-muted">
          Signature and payment come next (Phases 3–4). For now, submitting holds the dates.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-ink/15 px-6 py-3 font-medium hover:bg-ink/5 transition-colors"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="rounded-full bg-accent px-8 py-3 text-paper font-medium hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {submitting ? "Submitting…" : "Confirm booking →"}
        </button>
      </div>
    </section>
  );
}

function SummaryBlock({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border border-ink/10 p-4 ${className}`}>
      <p className="font-mono text-xs uppercase tracking-widest text-muted">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}
