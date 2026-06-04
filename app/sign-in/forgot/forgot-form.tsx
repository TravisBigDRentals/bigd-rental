"use client";

import { useActionState } from "react";
import { requestPasswordResetAction } from "../actions";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="block text-sm font-medium">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2"
        />
      </label>
      {state?.error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">
          {state.ok}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-accent px-6 py-3 text-paper font-medium hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
      >
        {pending ? "…" : "Send reset link"}
      </button>
    </form>
  );
}
