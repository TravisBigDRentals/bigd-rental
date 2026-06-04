"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import { PaymentForm, CreditCard } from "react-square-web-payments-sdk";
import type { Addon, Equipment } from "@/lib/bookings/queries";
import { calculatePricing, formatCents } from "@/lib/pricing";
import { DLDropZone } from "@/components/dl-drop-zone";
import { PasswordField } from "@/components/password-field";
import { publicEquipmentImageUrl } from "@/lib/equipment-images";
import { PricingWidget, PricingMobileBar } from "./_components/pricing-widget";

function dateToISO(d: Date): string {
  // Local-date ISO (YYYY-MM-DD) — avoids UTC drift from toISOString().
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoToDate(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

type Step = 1 | 2 | 3 | 4 | 5;
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

// Build the string manually rather than asking the locale formatter to
// render partial date shapes — browsers do unpredictable things when you
// ask for `{day: "numeric", year: "numeric"}` with no month, including
// emitting weird patterns like "(day: 20)" in some en-CA fallbacks.
function formatDateRange(startISO: string, endISO: string): string {
  if (!startISO || !endISO) return "";
  const s = new Date(startISO + "T00:00:00");
  const e = new Date(endISO + "T00:00:00");
  const month = (d: Date) => d.toLocaleDateString("en-CA", { month: "short" });
  const day   = (d: Date) => d.getDate();
  const year  = (d: Date) => d.getFullYear();

  const sameYear  = year(s) === year(e);
  const sameMonth = sameYear && s.getMonth() === e.getMonth();
  const sameDay   = sameMonth && day(s) === day(e);

  if (sameDay)   return `${month(s)} ${day(s)}, ${year(s)}`;
  if (sameMonth) return `${month(s)} ${day(s)} – ${day(e)}, ${year(s)}`;
  if (sameYear)  return `${month(s)} ${day(s)} – ${month(e)} ${day(e)}, ${year(s)}`;
  return `${month(s)} ${day(s)}, ${year(s)} – ${month(e)} ${day(e)}, ${year(e)}`;
}

function DateRangeCalendar({
  startDate,
  endDate,
  onDayClick,
  blockedRanges,
}: {
  startDate: string;
  endDate: string;
  onDayClick: (day: Date) => void;
  blockedRanges: { start_date: string; end_date: string }[];
}) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // We still hand react-day-picker a range so it paints range_start /
  // range_middle / range_end visuals; click routing is done manually
  // via onDayClick so we can support both two-click range AND
  // box-targeting flows.
  const selected: DateRange | undefined = useMemo(() => {
    if (!startDate) return undefined;
    return {
      from: isoToDate(startDate),
      to: endDate ? isoToDate(endDate) : undefined,
    };
  }, [startDate, endDate]);

  const disabled = useMemo(
    () => [
      { before: today },
      ...blockedRanges.map((r) => {
        const from = isoToDate(r.start_date);
        const to = isoToDate(r.end_date);
        to.setDate(to.getDate() + 1);
        return { from, to };
      }),
    ],
    [blockedRanges, today],
  );

  return (
    <div
      className="rounded-2xl border border-ink/15 bg-paper p-4 inline-block max-w-full overflow-x-auto"
      style={{
        ["--rdp-accent-color" as string]: "var(--color-accent)",
        ["--rdp-accent-background-color" as string]: "rgb(212 137 26 / 0.15)",
      }}
    >
      <DayPicker
        mode="range"
        selected={selected}
        onSelect={(_range, triggerDate) => {
          if (triggerDate) onDayClick(triggerDate);
        }}
        disabled={disabled}
        numberOfMonths={1}
        defaultMonth={selected?.from ?? today}
        showOutsideDays
      />
    </div>
  );
}

// Mirrors the DB trigger's overlap logic: both ranges are treated as
// [start, end + 1 day] inclusive (the +1 is the inspection-day buffer).
function rangesConflictWithBuffer(s1: string, e1: string, s2: string, e2: string): boolean {
  if (!s1 || !e1 || !s2 || !e2) return false;
  const ms = (iso: string) => new Date(iso + "T00:00:00").getTime();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const s1m = ms(s1), e1m = ms(e1) + ONE_DAY;
  const s2m = ms(s2), e2m = ms(e2) + ONE_DAY;
  return s1m <= e2m && s2m <= e1m;
}

type InitialCustomer = {
  first_name: string;
  last_name: string;
  business_name: string | null;
  email: string;
  phone: string;
  drivers_license_front_url: string;
  drivers_license_back_url: string;
  customer_address_line1: string;
  customer_address_line2: string | null;
  customer_city: string;
  customer_province: string;
  customer_postal_code: string;
  project_address_line1: string;
  project_address_line2: string | null;
  project_city: string;
  project_province: string;
  project_postal_code: string;
};

function customerStateFromInitial(c: InitialCustomer | null, authEmail: string | null): CustomerState {
  if (!c) {
    return authEmail
      ? { ...EMPTY_CUSTOMER, email: authEmail }
      : EMPTY_CUSTOMER;
  }
  return {
    first_name: c.first_name,
    last_name: c.last_name,
    business_name: c.business_name ?? "",
    email: c.email,
    phone: c.phone,
    // License paths from the saved customer record — when the user
    // confirms their previous license is still valid, we round-trip
    // these paths back to /api/bookings/create unchanged.
    drivers_license_front_path: c.drivers_license_front_url,
    drivers_license_back_path: c.drivers_license_back_url,
    customer_address_line1: c.customer_address_line1,
    customer_address_line2: c.customer_address_line2 ?? "",
    customer_city: c.customer_city,
    customer_province: c.customer_province,
    customer_postal_code: c.customer_postal_code,
    project_address_line1: c.project_address_line1,
    project_address_line2: c.project_address_line2 ?? "",
    project_city: c.project_city,
    project_province: c.project_province,
    project_postal_code: c.project_postal_code,
  };
}

export function BookingForm({
  equipment,
  addons,
  initialCustomer = null,
  isAuthenticated = false,
  authEmail = null,
  initialStartDate = null,
  initialEndDate = null,
  initialDropoffTime = null,
  prefillNotice = null,
}: {
  equipment: Equipment[];
  addons: Addon[];
  initialCustomer?: InitialCustomer | null;
  isAuthenticated?: boolean;
  authEmail?: string | null;
  initialStartDate?: string | null;
  initialEndDate?: string | null;
  initialDropoffTime?: DropoffTime | null;
  prefillNotice?: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [equipmentId, setEquipmentId] = useState<string>("");
  // Empty default — customer must explicitly pick both dates. No silent
  // "today" prefill (was misleading + clashed with the new white/dark
  // empty/filled visual state).
  const [startDate, setStartDate] = useState<string>(initialStartDate ?? "");
  const [endDate, setEndDate] = useState<string>(initialEndDate ?? "");
  // Empty string = "customer hasn't picked a time yet". We require an
  // explicit selection before letting them move past Step 1 — no
  // silently-accepted default.
  const [dropoffTime, setDropoffTime] = useState<DropoffTime | "">(initialDropoffTime ?? "");
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [customer, setCustomer] = useState<CustomerState>(
    () => customerStateFromInitial(initialCustomer, authEmail),
  );

  // License flow: if the signed-in customer has a previously uploaded
  // license on file, default to "confirm" (no re-upload required) and let
  // them switch to "reupload" via the checkbox if their license changed.
  // Anonymous bookings and signed-in customers without a stored license
  // always re-upload.
  const hasPreviousLicense = !!(initialCustomer?.drivers_license_front_url && initialCustomer?.drivers_license_back_url);
  type LicenseChoice = "confirm" | "reupload" | null;
  // Default is null when a previous license exists — the customer must
  // explicitly check one box. Liability: we shouldn't auto-affirm on
  // their behalf. Anonymous / first-time customers default to "reupload"
  // (no previous license to confirm).
  const [licenseChoice, setLicenseChoice] = useState<LicenseChoice>(
    hasPreviousLicense ? null : "reupload",
  );

  // Paths in state are pre-populated from initialCustomer when there's a
  // previous license. They stay until the user picks "reupload", at which
  // point we clear them so they have to upload fresh files. Confirm
  // restores the originals (in case the user toggled to reupload then
  // back). Null choice = paths stay as-is (originals) but validation
  // blocks Next.
  useEffect(() => {
    if (!hasPreviousLicense) return;
    if (licenseChoice === "confirm" && initialCustomer) {
      setCustomer((prev) => ({
        ...prev,
        drivers_license_front_path: initialCustomer.drivers_license_front_url,
        drivers_license_back_path: initialCustomer.drivers_license_back_url,
      }));
    } else if (licenseChoice === "reupload") {
      setCustomer((prev) => ({
        ...prev,
        drivers_license_front_path: null,
        drivers_license_back_path: null,
      }));
    }
  }, [licenseChoice, hasPreviousLicense, initialCustomer]);
  // Anonymous bookers can opt to save their info — we provision a Supabase
  // Auth user at booking-submit time and link this booking's customer row
  // to it. Hidden entirely for already-signed-in users.
  const [createAccount, setCreateAccount] = useState(false);
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPasswordConfirm, setAccountPasswordConfirm] = useState("");
  // Coupon state lives at the booking-form level so the pricing widget
  // (rendered alongside Step 3) and the booking-create call both see the
  // applied discount. `appliedCoupon` is what the server validated; the
  // raw `couponCode` input is just what's in the textbox until Apply.
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<
    { code: string; discount_type: "percent" | "amount"; discount_value: number } | null
  >(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponValidating, setCouponValidating] = useState(false);
  const [specialInstructions, setSpecialInstructions] = useState<string>("");
  const [bookingId, setBookingId] = useState<string | null>(null);
  // Result flags from /api/bookings/create — surfaced on the confirmation
  // page via query string. `accountCreated` ⇒ we provisioned + signed in.
  // `accountEmailCollision` ⇒ they ticked Save my info but an account
  // already existed; we silently kept the booking anonymous.
  const [accountCreated, setAccountCreated] = useState(false);
  const [accountEmailCollision, setAccountEmailCollision] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [uploadingFront, setUploadingFront] = useState(false);
  const [uploadingBack, setUploadingBack] = useState(false);
  const [creatingBooking, setCreatingBooking] = useState(false);
  const [paying, setPaying] = useState(false);
  const [blockedRanges, setBlockedRanges] = useState<{ start_date: string; end_date: string }[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [activeField, setActiveField] = useState<"delivery" | "pickup">("delivery");

  // Single click-handler that backs BOTH date-picking paths:
  //   1. Two-click range — user just clicks two dates. Default activeField
  //      is "delivery", so click 1 sets delivery + auto-advances to pickup,
  //      click 2 sets pickup. Same UX as before.
  //   2. Box-targeting — user clicks the Delivery or Pickup box first to set
  //      activeField, then a single calendar click fills that exact field.
  function handleCalendarDayClick(day: Date) {
    const iso = dateToISO(day);
    if (activeField === "delivery") {
      setStartDate(iso);
      // If existing pickup is now invalid (<= new delivery), drop it so the
      // user can re-pick. Auto-advance focus to pickup field.
      if (endDate && isoToDate(endDate) <= day) setEndDate("");
      setActiveField("pickup");
      return;
    }
    // activeField === "pickup"
    if (!startDate) {
      // No delivery yet — silently treat this click as delivery instead.
      setStartDate(iso);
      return;
    }
    if (day <= isoToDate(startDate)) {
      // User clicked earlier than (or same as) delivery; treat as resetting
      // delivery rather than throwing an error.
      setStartDate(iso);
      setEndDate("");
      return;
    }
    setEndDate(iso);
  }

  // Scroll error into view when one appears — error banner is at the top of the
  // form; user has typically scrolled down by the time they hit Next.
  useEffect(() => {
    if (error) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [error]);

  // Scroll to top whenever the step changes so users see the form header +
  // step indicator instead of staying at their previous scroll position.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  // Fetch all booked ranges for the selected equipment so we can show them
  // inline and disable Next when the picked dates conflict — better UX than
  // surfacing the conflict only after the user clicks Next.
  useEffect(() => {
    if (!equipmentId) {
      setBlockedRanges([]);
      return;
    }
    let cancelled = false;
    setLoadingAvailability(true);
    const today = todayISO();
    const oneYearOut = (() => {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      return d.toISOString().slice(0, 10);
    })();
    fetch("/api/bookings/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ equipment_id: equipmentId, start_date: today, end_date: oneYearOut }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setBlockedRanges(Array.isArray(json.conflicts) ? json.conflicts : []);
      })
      .catch(() => { if (!cancelled) setBlockedRanges([]); })
      .finally(() => { if (!cancelled) setLoadingAvailability(false); });
    return () => { cancelled = true; };
  }, [equipmentId]);

  const currentConflict = useMemo(() => {
    if (!startDate || !endDate || !blockedRanges.length) return null;
    return blockedRanges.find((r) =>
      rangesConflictWithBuffer(startDate, endDate, r.start_date, r.end_date),
    ) ?? null;
  }, [startDate, endDate, blockedRanges]);

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

  // Resolve which image to show. Order of precedence:
  //   1. Most recently selected addon's combo image (last in addonIds[])
  //   2. Selected equipment's base image
  //   3. null (renders placeholder)
  const previewImageUrl = useMemo(() => {
    if (!selectedEquipment) return null;
    const lastAddonId = addonIds[addonIds.length - 1];
    if (lastAddonId) {
      const lastAddon = addons.find((a) => a.id === lastAddonId);
      const url = publicEquipmentImageUrl(lastAddon?.image_url);
      if (url) return url;
    }
    return publicEquipmentImageUrl(selectedEquipment.image_url);
  }, [selectedEquipment, addonIds, addons]);

  const pricing = useMemo(() => {
    if (!selectedEquipment || !startDate || !endDate) return null;
    return calculatePricing({
      startDate,
      endDate,
      equipmentDailyRateCents: selectedEquipment.daily_rate_cents,
      equipmentWeeklyRateCents: selectedEquipment.weekly_rate_cents,
      equipmentMonthlyRateCents: selectedEquipment.monthly_rate_cents,
      addons: selectedAddons.map((a) => ({
        addonId: a.id,
        dailyRateCents: a.daily_rate_cents,
        quantity: 1,
      })),
      discount: appliedCoupon
        ? { type: appliedCoupon.discount_type, value: appliedCoupon.discount_value }
        : null,
    });
  }, [selectedEquipment, selectedAddons, startDate, endDate, appliedCoupon]);

  async function applyCoupon() {
    const trimmed = couponCode.trim();
    if (!trimmed) return;
    setCouponValidating(true);
    setCouponError(null);
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const json = await res.json();
      if (!json.ok) {
        setCouponError(json.error ?? "That code isn't valid.");
        setAppliedCoupon(null);
        return;
      }
      setAppliedCoupon({
        code: json.code,
        discount_type: json.discount_type,
        discount_value: json.discount_value,
      });
      setCouponCode(json.code);
    } catch {
      setCouponError("Couldn't reach the server. Try again.");
    } finally {
      setCouponValidating(false);
    }
  }

  function clearCoupon() {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError(null);
  }

  // `end_date` IS the pickup date in our data model — no +1.
  const pickupDateISO = endDate;

  function toggleAddon(id: string) {
    setAddonIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function updateCustomer<K extends keyof CustomerState>(key: K, value: CustomerState[K]) {
    setCustomer((prev) => ({ ...prev, [key]: value }));
  }

  // Returning-customer pre-fill is now handled SERVER-SIDE at /book load,
  // gated by Supabase Auth — the customer must be signed in. The email-blur
  // lookup that used to live here was a privacy leak (anyone who guessed an
  // email could see that customer's data). Removed deliberately.

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
    if (!startDate || !endDate) return setError("Pick delivery and pickup dates");
    if (new Date(endDate) <= new Date(startDate)) {
      return setError("Pickup date must be at least one day after the delivery date");
    }
    if (!dropoffTime) return setError("Pick a drop-off time");

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
    if (hasPreviousLicense && licenseChoice === null) {
      return setError("Confirm your previous driver's license is still valid, or choose to re-upload");
    }
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
    if (!isAuthenticated && createAccount) {
      if (accountPassword.length < 8) {
        return setError("Password must be at least 8 characters (or uncheck \"Save my info\")");
      }
      if (accountPassword !== accountPasswordConfirm) {
        return setError("Passwords don't match — re-enter them in both fields");
      }
    }
    setStep(3);
  }

  async function createBookingAndAdvanceToSign() {
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
            password: !isAuthenticated && createAccount ? accountPassword : null,
          },
          booking: {
            equipment_id: equipmentId,
            start_date: startDate,
            end_date: endDate,
            dropoff_time: dropoffTime,
            special_instructions: specialInstructions.trim() || null,
            addon_ids: addonIds,
            coupon_code: appliedCoupon?.code ?? null,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Booking failed");
        return;
      }
      setBookingId(json.booking_id);
      setAccountCreated(!!json.account_created);
      setAccountEmailCollision(!!json.account_email_collision);
      setStep(4);
    } finally {
      setCreatingBooking(false);
    }
  }

  function handleSignatureComplete() {
    setError(null);
    setStep(5);
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
      const params = new URLSearchParams({ id: bookingId });
      if (accountCreated) params.set("acct", "created");
      else if (accountEmailCollision) params.set("acct", "exists");
      router.push(`/book/confirmed?${params.toString()}`);
    } finally {
      setPaying(false);
    }
  }

  return (
    <div>
      <StepIndicator step={step} />

      {prefillNotice && (
        <div className="mb-6 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
          {prefillNotice}
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      )}

      {(step === 1 || step === 2 || step === 3) ? (
        <>
        <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-8 lg:items-start pb-24 lg:pb-0">
          {/* Form content (left column on desktop, full width + bottom-padding on mobile) */}
          <div className="min-w-0">
            {step === 1 && (
              <StepConfigure
                equipment={equipment}
                equipmentId={equipmentId}
                setEquipmentId={(id) => { setEquipmentId(id); setAddonIds([]); }}
                startDate={startDate}
                endDate={endDate}
                pickupDate={pickupDateISO}
                dropoffTime={dropoffTime} setDropoffTime={setDropoffTime}
                compatibleAddons={compatibleAddons}
                addonIds={addonIds} toggleAddon={toggleAddon}
                pricing={pricing}
                previewImageUrl={previewImageUrl}
                blockedRanges={blockedRanges}
                loadingAvailability={loadingAvailability}
                currentConflict={currentConflict}
                activeField={activeField}
                setActiveField={setActiveField}
                onCalendarDayClick={handleCalendarDayClick}
              />
            )}
            {step === 2 && (
              <StepCustomer
                customer={customer} updateCustomer={updateCustomer}
                emailLocked={isAuthenticated}
                hasPreviousLicense={hasPreviousLicense}
                licenseChoice={licenseChoice}
                setLicenseChoice={setLicenseChoice}
                onDLFrontChange={(f) => uploadDL(f, "front")}
                onDLBackChange={(f) => uploadDL(f, "back")}
                uploadingFront={uploadingFront} uploadingBack={uploadingBack}
                showSaveInfoOption={!isAuthenticated}
                createAccount={createAccount}
                setCreateAccount={setCreateAccount}
                accountPassword={accountPassword}
                setAccountPassword={setAccountPassword}
                accountPasswordConfirm={accountPasswordConfirm}
                setAccountPasswordConfirm={setAccountPasswordConfirm}
                onBack={() => setStep(1)}
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
                couponCode={couponCode}
                setCouponCode={setCouponCode}
                appliedCoupon={appliedCoupon}
                couponError={couponError}
                couponValidating={couponValidating}
                applyCoupon={applyCoupon}
                clearCoupon={clearCoupon}
                onBack={() => setStep(2)}
                submitting={creatingBooking}
              />
            )}
          </div>
          {/* Desktop sticky sidebar */}
          <PricingWidget
            equipment={selectedEquipment}
            startDate={startDate}
            endDate={endDate}
            selectedAddons={selectedAddons}
            appliedCoupon={appliedCoupon}
            nextLabel={
              step === 1 ? "Next: your info →" :
              step === 2 ? "Next: review →" :
              "Continue to sign →"
            }
            nextDisabled={
              step === 1 ? (!equipmentId || !!currentConflict) :
              false
            }
            loading={
              step === 1 ? checkingAvailability :
              step === 3 ? creatingBooking :
              false
            }
            onNext={
              step === 1 ? goToStep2 :
              step === 2 ? goToStep3 :
              createBookingAndAdvanceToSign
            }
          />
        </div>
        {/* Mobile fixed bottom bar — outside the grid so it can't
            interfere with the desktop sidebar's grid-cell layout */}
        <PricingMobileBar
          equipment={selectedEquipment}
          startDate={startDate}
          endDate={endDate}
          selectedAddons={selectedAddons}
          nextLabel={
            step === 1 ? "Next →" :
            step === 2 ? "Review →" :
            "Sign →"
          }
          nextDisabled={
            step === 1 ? (!equipmentId || !!currentConflict) :
            false
          }
          loading={
            step === 1 ? checkingAvailability :
            step === 3 ? creatingBooking :
            false
          }
          onNext={
            step === 1 ? goToStep2 :
            step === 2 ? goToStep3 :
            createBookingAndAdvanceToSign
          }
        />
        </>
      ) : null}

      {step === 4 && bookingId && (
        <StepSign
          bookingId={bookingId}
          onSigned={handleSignatureComplete}
          onBack={() => setStep(3)}
        />
      )}

      {step === 5 && pricing && (
        <StepPay totalCents={pricing.totalCents}
          applicationId={SQUARE_APP_ID} locationId={SQUARE_LOC_ID}
          customerPostalCode={customer.customer_postal_code}
          paying={paying} onPaymentToken={handlePaymentToken}
          onBack={() => setStep(4)} />
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const labels = ["Configure", "Your info", "Review", "Sign", "Pay"];
  return (
    <ol className="mb-12 flex items-start justify-between gap-2 sm:gap-4 max-w-3xl mx-auto">
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        const active = step === n;
        const done = step > n;
        const reached = active || done;
        const next = labels[i + 1];
        return (
          <li key={label} className="flex-1 flex flex-col items-center min-w-0 relative">
            <div className="w-full flex items-center">
              <span className={`relative z-10 flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full text-sm font-display tracking-wide shrink-0 ${
                active ? "bg-ink text-paper"
                  : done ? "bg-ink text-paper"
                  : "bg-paper border border-ink/20 text-ink/40"
              }`}>
                {done ? "✓" : n}
              </span>
              {next && (
                <span className={`flex-1 h-[2px] ml-1 sm:ml-2 ${reached && step > n ? "bg-accent" : active ? "bg-accent" : "bg-ink/15"}`} />
              )}
            </div>
            <span className={`mt-2 text-xs sm:text-sm font-medium text-center truncate w-full ${reached ? "text-ink" : "text-ink/40"}`}>
              {label}
            </span>
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
  startDate: string;
  endDate: string;
  pickupDate: string;
  dropoffTime: DropoffTime | ""; setDropoffTime: (t: DropoffTime | "") => void;
  compatibleAddons: Addon[];
  addonIds: string[]; toggleAddon: (id: string) => void;
  pricing: ReturnType<typeof calculatePricing> | null;
  previewImageUrl: string | null;
  blockedRanges: { start_date: string; end_date: string }[];
  loadingAvailability: boolean;
  currentConflict: { start_date: string; end_date: string } | null;
  activeField: "delivery" | "pickup";
  setActiveField: (f: "delivery" | "pickup") => void;
  onCalendarDayClick: (day: Date) => void;
}) {
  const {
    equipment, equipmentId, setEquipmentId,
    startDate, endDate, pickupDate,
    dropoffTime, setDropoffTime,
    compatibleAddons, addonIds, toggleAddon,
    previewImageUrl,
    blockedRanges, loadingAvailability, currentConflict,
    activeField, setActiveField, onCalendarDayClick,
  } = props;

  return (
    <section className="space-y-12">
      <div>
        <SectionTitle>Pick a machine</SectionTitle>
        <div className="mt-6 flex flex-col lg:flex-row gap-5 lg:items-start">
          {/* Machine cards: single-column stack on the left */}
          <div className="lg:flex-1 lg:min-w-0 space-y-4">
            {equipment.map((eq) => {
              const selected = equipmentId === eq.id;
              return (
                <button key={eq.id} type="button" onClick={() => setEquipmentId(eq.id)}
                  className={`w-full text-left rounded-xl border bg-paper transition-all ${
                    selected
                      ? "border-accent shadow-[0_0_0_3px_rgba(213,139,27,0.15)]"
                      : "border-ink/15 hover:border-ink/30"
                  }`}>
                  <div className="p-5 pb-4">
                    <p className="font-display text-xl tracking-wide uppercase">{eq.name}</p>
                    <p className="mt-1 font-mono text-xs text-muted">{eq.serial}</p>
                    {eq.description && (
                      <p className="mt-3 text-sm text-ink/75 leading-relaxed">{eq.description}</p>
                    )}
                  </div>
                  <div className="border-t border-ink/10 grid grid-cols-3 divide-x divide-ink/10">
                    <RateCell label="Daily rate" cents={eq.daily_rate_cents} />
                    <RateCell label="Weekly rate" cents={eq.weekly_rate_cents} />
                    <RateCell label="Monthly rate" cents={eq.monthly_rate_cents} />
                  </div>
                </button>
              );
            })}
          </div>
          {/* Image preview panel */}
          <div className="lg:flex-1 lg:min-w-0">
            <div className="aspect-[4/3] rounded-xl bg-paper border border-ink/10 overflow-hidden p-6 flex items-center justify-center">
              {previewImageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={previewImageUrl}
                  alt="Selected equipment"
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <p className="font-display tracking-wide uppercase text-sm text-ink/40 text-center px-6">
                  Select a machine to see what you&rsquo;re renting.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {equipmentId && compatibleAddons.length > 0 && (
        <div>
          <SectionTitle>Attachments</SectionTitle>
          <p className="mt-3 text-sm text-muted">
            First attachment is free. Each additional attachment is{" "}
            {formatCents(compatibleAddons[0]?.daily_rate_cents ?? 4000)}/day.
          </p>
          <div className="mt-5 space-y-2.5">
            {compatibleAddons.map((addon) => {
              const checked = addonIds.includes(addon.id);
              return (
                <label key={addon.id}
                  className={`flex items-center justify-between gap-3 rounded-full border px-5 py-3.5 cursor-pointer transition-colors ${
                    checked
                      ? "border-ink bg-ink text-paper"
                      : "border-ink/15 bg-paper hover:border-ink/30"
                  }`}>
                  <span className="flex items-center gap-3 min-w-0">
                    <span className={`relative inline-flex h-5 w-5 items-center justify-center rounded-full border shrink-0 ${
                      checked ? "border-accent" : "border-ink/30"
                    }`}>
                      {checked && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
                      <input type="checkbox" checked={checked}
                        onChange={() => toggleAddon(addon.id)}
                        className="absolute inset-0 opacity-0 cursor-pointer" />
                    </span>
                    <span className="font-display tracking-wide uppercase text-sm truncate">{addon.name}</span>
                  </span>
                  <span className="font-mono text-sm whitespace-nowrap">
                    <span className="font-semibold">{formatCents(addon.daily_rate_cents)}</span>
                    <span className={checked ? "text-paper/70" : "text-muted"}>/day</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <SectionTitle>Rental dates</SectionTitle>
        {equipmentId ? (
          <p className="mt-3 text-sm text-muted">
            Click two dates on the calendar to pick a range, or click <strong>Delivery date</strong> /{" "}
            <strong>Pickup date</strong> first to control which one the next click sets. Greyed-out days are unavailable.
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted">Pick a machine above to see availability.</p>
        )}

        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start">
          {equipmentId && (
            <DateRangeCalendar
              startDate={startDate}
              endDate={endDate}
              onDayClick={onCalendarDayClick}
              blockedRanges={blockedRanges}
            />
          )}
          <div className="flex flex-col gap-3 lg:min-w-[260px]">
            <DateSlotCard
              label="Delivery date"
              filled={!!startDate}
              active={activeField === "delivery"}
              onClick={() => setActiveField("delivery")}
              value={startDate || "Pick a day →"}
              isPlaceholder={!startDate}
            />
            <DateSlotCard
              label="Pickup date"
              filled={!!endDate}
              active={activeField === "pickup"}
              onClick={() => setActiveField("pickup")}
              value={endDate || "Pick a day →"}
              isPlaceholder={!endDate}
            />
            {(() => {
              const filled = !!dropoffTime;
              const labelColor = filled ? "text-accent" : "text-muted";
              const valueColor = filled ? "text-paper" : "text-ink/40";
              const surface = filled
                ? "bg-ink"
                : "bg-white border border-ink/15 hover:border-ink/30";
              return (
                <label className={`block rounded-lg px-4 py-3 cursor-pointer transition-colors ${surface}`}>
                  <span className={`block font-display tracking-[0.12em] text-[10px] uppercase ${labelColor}`}>Drop-off time</span>
                  <div className="relative mt-1">
                    <select value={dropoffTime}
                      onChange={(e) => setDropoffTime(e.target.value as DropoffTime | "")}
                      className={`w-full bg-transparent text-base focus:outline-none cursor-pointer appearance-none pr-7 ${valueColor}`}>
                      <option value="" disabled className="text-ink">Select a time</option>
                      <option className="text-ink">9:00 AM</option>
                      <option className="text-ink">10:00 AM</option>
                    </select>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 h-5 w-5 text-accent"
                      fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </label>
              );
            })()}
          </div>
        </div>
        {startDate && (
          <div className="mt-5 rounded-lg bg-paper border border-ink/10 px-4 py-3 flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-accent text-paper text-base shrink-0" aria-hidden>📅</span>
            <p className="text-sm">
              <span className="font-display tracking-[0.08em] text-xs uppercase text-muted">Equipment drop-off: </span>
              <span className="font-medium">{formatLongDate(startDate)}</span>
              {dropoffTime && <span className="text-muted"> at {dropoffTime}</span>}
            </p>
          </div>
        )}
        {pickupDate && (
          <div className="mt-3 rounded-lg bg-paper border border-ink/10 px-4 py-3 flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-accent text-paper text-base shrink-0" aria-hidden>📅</span>
            <p className="text-sm">
              <span className="font-display tracking-[0.08em] text-xs uppercase text-muted">Equipment pickup: </span>
              <span className="font-medium">{formatLongDate(pickupDate)}</span>
              {dropoffTime && <span className="text-muted"> at {dropoffTime}</span>}
            </p>
          </div>
        )}

        {equipmentId && !loadingAvailability && blockedRanges.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">This machine is unavailable on:</p>
            <ul className="mt-1 list-disc pl-5">
              {blockedRanges.map((r, i) => (
                <li key={i}>{formatDateRange(r.start_date, addOneDay(r.end_date))}</li>
              ))}
            </ul>
          </div>
        )}

        {currentConflict && (
          <div className="mt-4 rounded-lg border border-red-400 bg-red-50 px-4 py-3 text-sm text-red-900">
            <p className="font-medium">Your selected dates overlap with an existing booking</p>
            <p className="mt-1">
              Unavailable: <strong>{formatDateRange(currentConflict.start_date, addOneDay(currentConflict.end_date))}</strong>.
              Pick a different range to continue.
            </p>
          </div>
        )}
      </div>

    </section>
  );
}

// Section heading: small orange square bullet + heavy uppercase title.
// Shared across Step 1's "Pick a machine", "Attachments", "Rental dates"
// sections to match the new design system.
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-block h-3 w-3 bg-accent shrink-0" aria-hidden />
      <h2 className="font-display text-2xl sm:text-3xl tracking-wide uppercase">{children}</h2>
    </div>
  );
}

// Tiered-rate cell used on each machine card (Daily / Weekly / Monthly).
// Renders an em-dash when the tier isn't priced for that equipment.
function RateCell({ label, cents }: { label: string; cents: number | null | undefined }) {
  return (
    <div className="px-4 py-3 text-left">
      <p className="font-display text-[10px] sm:text-xs tracking-[0.12em] uppercase text-accent">{label}</p>
      <p className="mt-1 font-mono text-base font-semibold">
        {typeof cents === "number" && cents > 0 ? formatCents(cents) : "—"}
      </p>
    </div>
  );
}

// Date pick-target card. Mirrors the attachment-pill pattern: light
// when the slot has no value yet, dark ink once a date is picked.
// `active` shows an accent ring no matter which surface is rendered,
// so the user always knows which slot the next calendar click will set.
function DateSlotCard({
  label, filled, active, onClick, value, isPlaceholder,
}: {
  label: string;
  filled: boolean;
  active: boolean;
  onClick: () => void;
  value: string;
  isPlaceholder: boolean;
}) {
  const surface = filled
    ? "bg-ink text-paper"
    : "bg-white border border-ink/15 text-ink hover:border-ink/30";
  const labelColor = filled ? "text-accent" : "text-muted";
  const valueColor = isPlaceholder
    ? filled ? "text-paper/40" : "text-ink/40"
    : "";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-left rounded-lg px-4 py-3 transition-colors ${surface} ${active ? "ring-2 ring-accent" : ""}`}
    >
      <span className={`block font-display tracking-[0.12em] text-[10px] uppercase ${labelColor}`}>{label}</span>
      <span className={`mt-1 block font-mono text-base ${valueColor}`}>{value}</span>
    </button>
  );
}

// --- Step 2: Customer info --------------------------------------------------

function StepCustomer(props: {
  customer: CustomerState;
  updateCustomer: <K extends keyof CustomerState>(key: K, value: CustomerState[K]) => void;
  emailLocked: boolean;
  hasPreviousLicense: boolean;
  licenseChoice: "confirm" | "reupload" | null;
  setLicenseChoice: (c: "confirm" | "reupload" | null) => void;
  onDLFrontChange: (file: File | null) => void;
  onDLBackChange: (file: File | null) => void;
  uploadingFront: boolean;
  uploadingBack: boolean;
  showSaveInfoOption: boolean;
  createAccount: boolean;
  setCreateAccount: (v: boolean) => void;
  accountPassword: string;
  setAccountPassword: (v: string) => void;
  accountPasswordConfirm: string;
  setAccountPasswordConfirm: (v: string) => void;
  onBack: () => void;
}) {
  const {
    customer, updateCustomer, emailLocked,
    hasPreviousLicense, licenseChoice, setLicenseChoice,
    onDLFrontChange, onDLBackChange,
    uploadingFront, uploadingBack,
    showSaveInfoOption, createAccount, setCreateAccount,
    accountPassword, setAccountPassword,
    accountPasswordConfirm, setAccountPasswordConfirm,
    onBack,
  } = props;

  // Email-blur lookup: when an anonymous booker types an email that
  // already has a Supabase Auth account, surface a "sign in to pre-fill
  // your info" nudge so they don't redo Step 2 by hand. Local state —
  // resets if the user navigates away from Step 2 and back.
  const [emailAccountExists, setEmailAccountExists] = useState<boolean | null>(null);
  const [emailHintDismissed, setEmailHintDismissed] = useState(false);

  return (
    <section className="space-y-10">
      <div>
        <h2 className="text-2xl font-bold uppercase">Your info</h2>
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
          <Field label={emailLocked ? "Email *  (account email, can't change here)" : "Email *"}>
            <input type="email" value={customer.email}
              onChange={(e) => {
                updateCustomer("email", e.target.value);
                // Any edit invalidates the previous lookup result and
                // re-allows the nudge if it was dismissed.
                setEmailAccountExists(null);
                setEmailHintDismissed(false);
              }}
              onBlur={() => {
                if (emailLocked) return;
                const email = customer.email.trim().toLowerCase();
                if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
                fetch("/api/auth/email-exists", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email }),
                })
                  .then((r) => r.json())
                  .then((json) => setEmailAccountExists(!!json.exists))
                  .catch(() => setEmailAccountExists(null));
              }}
              readOnly={emailLocked}
              className={`mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 ${emailLocked ? "bg-ink/[0.04] text-muted cursor-not-allowed" : "bg-paper"}`}
              required />
            {!emailLocked && emailAccountExists === true && !emailHintDismissed && (
              <div className="mt-2 flex items-start gap-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs">
                <span className="mt-0.5">👋</span>
                <div className="flex-1">
                  We&rsquo;ve got an account for <strong>{customer.email}</strong>.{" "}
                  <a href="/sign-in?next=/book" className="underline font-medium hover:text-accent">
                    Sign in
                  </a>{" "}
                  to pre-fill your info and skip the DL re-upload.
                </div>
                <button
                  type="button"
                  onClick={() => setEmailHintDismissed(true)}
                  aria-label="Dismiss"
                  className="text-muted hover:text-ink text-sm leading-none"
                >
                  ×
                </button>
              </div>
            )}
          </Field>
          <Field label="Phone *">
            <input type="tel" value={customer.phone}
              onChange={(e) => updateCustomer("phone", e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" required />
          </Field>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold uppercase">Driver&rsquo;s license</h2>

        {hasPreviousLicense ? (
          <>
            <p className="mt-1 text-sm text-muted">
              We have a driver&rsquo;s license on file from a previous booking. Confirm it&rsquo;s still valid, or re-upload if it&rsquo;s changed.
            </p>
            <div className="mt-4 space-y-3">
              <label className={`flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                licenseChoice === "confirm" ? "border-accent bg-accent/5" : "border-ink/15 hover:border-ink/30"
              }`}>
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
                  checked={licenseChoice === "confirm"}
                  onChange={(e) => setLicenseChoice(e.target.checked ? "confirm" : null)}
                />
                <span className="text-sm">
                  I confirm my previously uploaded license is up to date and valid in Alberta, Canada.
                </span>
              </label>
              <label className={`flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                licenseChoice === "reupload" ? "border-accent bg-accent/5" : "border-ink/15 hover:border-ink/30"
              }`}>
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
                  checked={licenseChoice === "reupload"}
                  onChange={(e) => setLicenseChoice(e.target.checked ? "reupload" : null)}
                />
                <span className="text-sm">
                  I would like to re-upload my license.
                </span>
              </label>
            </div>
            {licenseChoice === "reupload" && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <DLDropZone label="LICENSE FRONT *" uploaded={!!customer.drivers_license_front_path}
                  uploading={uploadingFront} onChange={onDLFrontChange} side="Front" />
                <DLDropZone label="LICENSE BACK *" uploaded={!!customer.drivers_license_back_path}
                  uploading={uploadingBack} onChange={onDLBackChange} side="Back" />
              </div>
            )}
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">Photo or PDF, both sides. Max 10 MB each.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <DLDropZone label="LICENSE FRONT *" uploaded={!!customer.drivers_license_front_path}
                uploading={uploadingFront} onChange={onDLFrontChange} side="Front" />
              <DLDropZone label="LICENSE BACK *" uploaded={!!customer.drivers_license_back_path}
                uploading={uploadingBack} onChange={onDLBackChange} side="Back" />
            </div>
          </>
        )}
      </div>

      <div>
        <h2 className="text-2xl font-bold uppercase">Billing Address</h2>
        <p className="mt-1 text-sm text-muted">
          Please enter the legal address for your business and or billing address for the credit card that will be used for payment.
        </p>
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
        <h2 className="text-2xl font-bold uppercase">Project address</h2>
        <p className="mt-1 text-sm text-muted">
          Where the equipment will be dropped off to and used (job site). The equipment will also be collected from this address.
        </p>
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

      {showSaveInfoOption && (
        <div>
          <h2 className="text-2xl font-bold uppercase">Save your info?</h2>
          <p className="mt-1 text-sm text-muted">
            Optional. Create an account using the email above so this booking
            shows in your account portal and your info pre-fills next time.
          </p>
          <label className={`mt-4 flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
            createAccount ? "border-accent bg-accent/5" : "border-ink/15 hover:border-ink/30"
          }`}>
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
              checked={createAccount}
              onChange={(e) => setCreateAccount(e.target.checked)}
            />
            <span className="text-sm">
              Save my info — create an account with <strong>{customer.email || "the email above"}</strong>.
            </span>
          </label>
          {createAccount && (
            <div className="mt-4 max-w-sm space-y-4">
              <Field label="Choose a password *">
                <PasswordField
                  value={accountPassword}
                  onChange={setAccountPassword}
                  minLength={8}
                />
                <span className="mt-1 block text-xs text-muted">At least 8 characters.</span>
              </Field>
              <Field label="Confirm password *">
                <PasswordField
                  value={accountPasswordConfirm}
                  onChange={setAccountPasswordConfirm}
                  minLength={8}
                  className={
                    accountPasswordConfirm && accountPasswordConfirm !== accountPassword
                      ? "border-red-400"
                      : "border-ink/15"
                  }
                />
                {accountPasswordConfirm && accountPasswordConfirm !== accountPassword && (
                  <span className="mt-1 block text-xs text-red-700">Passwords don&rsquo;t match.</span>
                )}
              </Field>
            </div>
          )}
        </div>
      )}

      <div>
        <button type="button" onClick={onBack}
          className="rounded-full border border-ink/15 px-6 py-3 font-medium hover:bg-ink/5 transition-colors">
          ← Back
        </button>
      </div>
    </section>
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
  dropoffTime: DropoffTime | "";
  addons: Addon[];
  customer: CustomerState;
  specialInstructions: string;
  setSpecialInstructions: (s: string) => void;
  pricing: ReturnType<typeof calculatePricing>;
  couponCode: string;
  setCouponCode: (s: string) => void;
  appliedCoupon: { code: string; discount_type: "percent" | "amount"; discount_value: number } | null;
  couponError: string | null;
  couponValidating: boolean;
  applyCoupon: () => void;
  clearCoupon: () => void;
  onBack: () => void;
  submitting: boolean;
}) {
  const {
    equipment, startDate, endDate, pickupDate, dropoffTime, addons, customer,
    specialInstructions, setSpecialInstructions, pricing,
    couponCode, setCouponCode, appliedCoupon, couponError, couponValidating,
    applyCoupon, clearCoupon,
    onBack, submitting,
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
        <h2 className="text-2xl font-bold uppercase">Review your booking</h2>
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

      <div>
        <h2 className="text-lg font-bold uppercase">Have a discount code?</h2>
        {appliedCoupon ? (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <span>
              <strong className="font-mono">{appliedCoupon.code}</strong> applied —{" "}
              {appliedCoupon.discount_type === "percent"
                ? `${appliedCoupon.discount_value}% off`
                : `${formatCents(appliedCoupon.discount_value)} off`}
            </span>
            <button type="button" onClick={clearCoupon} className="underline hover:no-underline">
              Remove
            </button>
          </div>
        ) : (
          <>
            <div className="mt-2 flex items-stretch gap-2 max-w-sm">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="ENTER CODE"
                className="flex-1 min-w-0 rounded-lg border border-ink/15 bg-paper px-3 py-2 font-mono uppercase tracking-wider"
              />
              <button
                type="button"
                onClick={applyCoupon}
                disabled={couponValidating || !couponCode.trim()}
                className="rounded-lg border border-ink/15 px-4 text-sm font-medium hover:bg-ink/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {couponValidating ? "…" : "Apply"}
              </button>
            </div>
            {couponError && (
              <p className="mt-2 text-xs text-red-700">{couponError}</p>
            )}
          </>
        )}
      </div>

      <div className="rounded-2xl border border-ink/10 bg-ink/[0.02] p-5 space-y-2">
        <div className="flex flex-col gap-0.5">
          <div className="flex justify-between">
            <span className="text-sm">{equipment.name}</span>
            <span className="font-mono">{formatCents(pricing.equipmentCents)}</span>
          </div>
          <div className="text-xs text-muted font-mono">
            {pricing.equipmentTier === "monthly" && equipment.monthly_rate_cents
              ? `${formatCents(equipment.monthly_rate_cents)}/mo · ${pricing.days} days`
              : pricing.equipmentTier === "weekly" && equipment.weekly_rate_cents
              ? `${formatCents(equipment.weekly_rate_cents)}/wk · ${pricing.days} days`
              : `${formatCents(equipment.daily_rate_cents)}/day × ${pricing.days}`}
          </div>
        </div>
        {pricing.addonsCents > 0 && (
          <div className="flex justify-between">
            <span className="text-sm">Attachments × {pricing.days} day{pricing.days === 1 ? "" : "s"}</span>
            <span className="font-mono">{formatCents(pricing.addonsCents)}</span>
          </div>
        )}
        {pricing.discountCents > 0 && appliedCoupon && (
          <div className="flex justify-between text-emerald-800">
            <span className="text-sm">Discount ({appliedCoupon.code})</span>
            <span className="font-mono">−{formatCents(pricing.discountCents)}</span>
          </div>
        )}
        <div className="border-t border-ink/10 pt-2 flex justify-between font-display text-xl font-semibold">
          <span>Total</span>
          <span>{formatCents(pricing.totalCents)}</span>
        </div>
      </div>

      <div>
        <button type="button" onClick={onBack} disabled={submitting}
          className="rounded-full border border-ink/15 px-6 py-3 font-medium hover:bg-ink/5 disabled:opacity-50 transition-colors">
          ← Back
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

// --- Step 4: Sign -----------------------------------------------------------

function StepSign({
  bookingId,
  onSigned,
  onBack,
}: {
  bookingId: string;
  onSigned: () => void;
  onBack: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"loading" | "open" | "finalizing" | "done">("loading");

  useEffect(() => {
    let cancelled = false;
    type HelloSignInstance = {
      open: (url: string, opts?: { testMode?: boolean; skipDomainVerification?: boolean }) => void;
      on: (event: string, cb: (data?: unknown) => void) => void;
      close: () => void;
    };
    let client: HelloSignInstance | null = null;

    (async () => {
      const clientId = process.env.NEXT_PUBLIC_HELLOSIGN_CLIENT_ID;
      if (!clientId) {
        setError("NEXT_PUBLIC_HELLOSIGN_CLIENT_ID is not configured");
        return;
      }
      // Dynamic import: hellosign-embedded touches `window` at module load,
      // so importing statically breaks Next.js's server bundle.
      const mod = await import("hellosign-embedded");
      if (cancelled) return;
      const HelloSign = mod.default as new (opts: { clientId: string }) => HelloSignInstance;
      client = new HelloSign({ clientId });

      client.on("sign", async () => {
        setPhase("finalizing");
        try {
          const res = await fetch(`/api/bookings/${bookingId}/finalize-signature`, { method: "POST" });
          if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            setError(json.error ?? "Failed to confirm signature");
            setPhase("open");
            return;
          }
          setPhase("done");
          onSigned();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to confirm signature");
          setPhase("open");
        }
      });

      client.on("error", (data: unknown) => {
        const msg = (data as { message?: string } | undefined)?.message;
        setError(`Signing error: ${msg ?? "unknown"}`);
      });

      try {
        const res = await fetch(`/api/bookings/${bookingId}/start-signature`, { method: "POST" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.sign_url) {
          setError(json.error ?? "Failed to start signing");
          return;
        }
        setPhase("open");
        client.open(json.sign_url, { testMode: true, skipDomainVerification: true });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to start signing");
      }
    })();

    return () => {
      cancelled = true;
      try { client?.close(); } catch { /* noop */ }
    };
  }, [bookingId, onSigned]);

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold uppercase">Sign your rental agreement</h2>
        <p className="mt-1 text-sm text-muted">
          The agreement will open in a signing window. Review carefully, sign at the bottom, and submit.
          Your signed copy will be stored with the booking and emailed to you after payment.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      )}
      {phase === "loading" && (
        <div className="rounded-lg border border-ink/15 bg-paper px-4 py-3 text-sm text-muted">
          Preparing your agreement…
        </div>
      )}
      {phase === "open" && !error && (
        <div className="rounded-lg border border-ink/15 bg-paper px-4 py-3 text-sm text-muted">
          The signing window should be open. If you closed it accidentally, click <strong>Back</strong> then <strong>Continue to sign</strong> to reopen.
        </div>
      )}
      {phase === "finalizing" && (
        <div className="rounded-lg border border-ink/15 bg-paper px-4 py-3 text-sm text-muted">
          Verifying signature…
        </div>
      )}
      {phase === "done" && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          ✓ Signature received — advancing to payment.
        </div>
      )}

      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} disabled={phase === "finalizing"}
          className="rounded-full border border-ink/15 px-6 py-3 font-medium hover:bg-ink/5 disabled:opacity-50 transition-colors">
          ← Back
        </button>
      </div>
    </section>
  );
}

// --- Step 5: Pay ------------------------------------------------------------

function StepPay({
  totalCents, applicationId, locationId, customerPostalCode, paying,
  onPaymentToken, onBack,
}: {
  totalCents: number;
  applicationId: string;
  locationId: string;
  customerPostalCode: string;
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
        <h2 className="text-2xl font-bold uppercase">Billing Details</h2>
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
          // overrides becomes the 3rd arg to Square.payments(); `language: en-CA`
          // switches the postal-code field's label from "ZIP" to "Postal Code"
          // and applies Canadian postal-code validation. The wrapper's types
          // don't list `language` but the underlying Square SDK accepts it.
          // @ts-expect-error react-square-web-payments-sdk types omit language
          overrides={{ language: "en-CA" }}
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
            postalCode={customerPostalCode}
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
