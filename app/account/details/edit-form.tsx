"use client";

import { useActionState, useState } from "react";
import { updateAccountAction, type UpdateAccountResult } from "./actions";

export type AccountInitial = {
  first_name: string;
  last_name: string;
  business_name: string;
  email: string;
  phone: string;
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
  has_license: boolean;
};

export function AccountDetailsForm({ initial }: { initial: AccountInitial }) {
  const [state, action, pending] = useActionState<UpdateAccountResult, FormData>(
    updateAccountAction,
    null,
  );
  const [replaceLicense, setReplaceLicense] = useState(false);
  const [uploadingFront, setUploadingFront] = useState(false);
  const [uploadingBack, setUploadingBack] = useState(false);
  const [frontPath, setFrontPath] = useState<string>("");
  const [backPath, setBackPath] = useState<string>("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleUpload(file: File | null, side: "front" | "back") {
    if (!file) return;
    const setLoading = side === "front" ? setUploadingFront : setUploadingBack;
    setUploadError(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/bookings/upload-dl", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.path) {
        setUploadError(json.error ?? "Upload failed");
        return;
      }
      if (side === "front") setFrontPath(json.path);
      else setBackPath(json.path);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form action={action} className="space-y-10">
      <input type="hidden" name="drivers_license_front_path" value={frontPath} />
      <input type="hidden" name="drivers_license_back_path" value={backPath} />

      {state?.success && (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          ✓ Details saved.
        </p>
      )}
      {state?.error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {state.error}
        </p>
      )}

      {/* Personal info */}
      <section>
        <h3 className="font-display text-lg font-semibold">Personal info</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="First name *">
            <input name="first_name" defaultValue={initial.first_name} required
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" />
          </Field>
          <Field label="Last name *">
            <input name="last_name" defaultValue={initial.last_name} required
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" />
          </Field>
          <Field label="Business name (optional)" className="sm:col-span-2">
            <input name="business_name" defaultValue={initial.business_name}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" />
          </Field>
          <Field label="Email (account login, can't change here)">
            <input type="email" value={initial.email} readOnly
              className="mt-1 w-full rounded-lg border border-ink/15 bg-ink/[0.04] text-muted px-3 py-2 cursor-not-allowed" />
          </Field>
          <Field label="Phone *">
            <input name="phone" type="tel" defaultValue={initial.phone} required
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" />
          </Field>
        </div>
      </section>

      {/* Billing address */}
      <section>
        <h3 className="font-display text-lg font-semibold">Billing address</h3>
        <p className="mt-1 text-sm text-muted">
          Legal address for your business / billing address for the credit card you use to pay.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Address line 1 *" className="sm:col-span-2">
            <input name="customer_address_line1" defaultValue={initial.customer_address_line1} required
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" />
          </Field>
          <Field label="Address line 2 (optional)" className="sm:col-span-2">
            <input name="customer_address_line2" defaultValue={initial.customer_address_line2}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" />
          </Field>
          <Field label="City *">
            <input name="customer_city" defaultValue={initial.customer_city} required
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" />
          </Field>
          <Field label="Province *">
            <input name="customer_province" defaultValue={initial.customer_province} required
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" />
          </Field>
          <Field label="Postal code *">
            <input name="customer_postal_code" defaultValue={initial.customer_postal_code} required
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" />
          </Field>
        </div>
      </section>

      {/* Project address */}
      <section>
        <h3 className="font-display text-lg font-semibold">Project address</h3>
        <p className="mt-1 text-sm text-muted">
          Where equipment is delivered / used / picked up. Can be the same as your billing address.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Address line 1 *" className="sm:col-span-2">
            <input name="project_address_line1" defaultValue={initial.project_address_line1} required
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" />
          </Field>
          <Field label="Address line 2 (optional)" className="sm:col-span-2">
            <input name="project_address_line2" defaultValue={initial.project_address_line2}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" />
          </Field>
          <Field label="City *">
            <input name="project_city" defaultValue={initial.project_city} required
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" />
          </Field>
          <Field label="Province *">
            <input name="project_province" defaultValue={initial.project_province} required
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" />
          </Field>
          <Field label="Postal code *">
            <input name="project_postal_code" defaultValue={initial.project_postal_code} required
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2" />
          </Field>
        </div>
      </section>

      {/* Driver's license */}
      <section>
        <h3 className="font-display text-lg font-semibold">Driver&rsquo;s license</h3>
        {initial.has_license ? (
          <>
            <p className="mt-1 text-sm text-muted">
              We have your license on file. Leave it unchanged, or check the box below to replace it.
            </p>
            <label className="mt-4 flex items-center gap-3 rounded-lg border border-ink/15 px-4 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={replaceLicense}
                onChange={(e) => {
                  setReplaceLicense(e.target.checked);
                  if (!e.target.checked) { setFrontPath(""); setBackPath(""); }
                }}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
              <span className="text-sm">Replace my license on file</span>
            </label>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">
            Upload the front and back of your license below. Photo or PDF, max 10 MB each.
          </p>
        )}
        {(replaceLicense || !initial.has_license) && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="License front">
              <input type="file" accept="image/*,application/pdf"
                onChange={(e) => handleUpload(e.target.files?.[0] ?? null, "front")}
                className="mt-1 w-full text-sm" />
              {uploadingFront && <p className="mt-1 text-xs text-muted">Uploading…</p>}
              {frontPath && !uploadingFront && (
                <p className="mt-1 font-mono text-xs text-muted">✓ Uploaded</p>
              )}
            </Field>
            <Field label="License back">
              <input type="file" accept="image/*,application/pdf"
                onChange={(e) => handleUpload(e.target.files?.[0] ?? null, "back")}
                className="mt-1 w-full text-sm" />
              {uploadingBack && <p className="mt-1 text-xs text-muted">Uploading…</p>}
              {backPath && !uploadingBack && (
                <p className="mt-1 font-mono text-xs text-muted">✓ Uploaded</p>
              )}
            </Field>
          </div>
        )}
        {uploadError && (
          <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
            {uploadError}
          </p>
        )}
      </section>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-accent px-6 py-3 text-paper font-medium hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
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
