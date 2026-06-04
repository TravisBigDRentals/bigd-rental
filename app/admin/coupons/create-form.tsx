"use client";

import { useActionState, useState } from "react";
import { createCouponAction } from "./actions";

export function CreateCouponForm() {
  const [state, formAction, pending] = useActionState(createCouponAction, null);
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className="block text-sm font-medium">Code</span>
        <input
          type="text"
          name="code"
          required
          maxLength={60}
          placeholder="SUMMER10"
          autoComplete="off"
          onChange={(e) => (e.target.value = e.target.value.toUpperCase())}
          className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 font-mono uppercase tracking-wider"
        />
        <span className="mt-1 block text-xs text-muted">Letters, numbers, underscore, dash. Stored uppercase.</span>
      </label>

      <label className="block">
        <span className="block text-sm font-medium">Discount type</span>
        <select
          name="discount_type"
          value={discountType}
          onChange={(e) => setDiscountType(e.target.value as "percent" | "amount")}
          className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2"
        >
          <option value="percent">Percent off (1-100)</option>
          <option value="amount">Dollar amount off (CAD)</option>
        </select>
      </label>

      <label className="block">
        <span className="block text-sm font-medium">
          {discountType === "percent" ? "Percent" : "Amount (CAD)"}
        </span>
        <input
          type="number"
          name="discount_value"
          required
          min={discountType === "percent" ? 1 : 0.01}
          max={discountType === "percent" ? 100 : undefined}
          step={discountType === "percent" ? 1 : 0.01}
          placeholder={discountType === "percent" ? "10" : "50.00"}
          className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="block text-sm font-medium">Max uses</span>
        <input
          type="number"
          name="max_uses"
          min={1}
          step={1}
          placeholder="Unlimited"
          className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2"
        />
        <span className="mt-1 block text-xs text-muted">Leave blank for unlimited.</span>
      </label>

      <label className="block">
        <span className="block text-sm font-medium">Expires on</span>
        <input
          type="date"
          name="expires_at"
          className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2"
        />
        <span className="mt-1 block text-xs text-muted">Optional. Code stops working at end of day.</span>
      </label>

      <div className="sm:col-span-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-accent px-6 py-2.5 text-paper font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {pending ? "Creating…" : "Create code"}
        </button>
        {state?.ok && <p className="text-sm text-emerald-800">{state.ok}</p>}
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      </div>
    </form>
  );
}
