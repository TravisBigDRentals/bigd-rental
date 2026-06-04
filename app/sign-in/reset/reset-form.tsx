"use client";

import { useActionState, useState } from "react";
import { updatePasswordAction } from "../actions";
import { PasswordField } from "@/components/password-field";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [state, formAction, pending] = useActionState(updatePasswordAction, null);
  const mismatch = !!passwordConfirm && passwordConfirm !== password;

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="block text-sm font-medium">New password</span>
        <PasswordField
          name="password"
          value={password}
          onChange={setPassword}
          required
          autoComplete="new-password"
          minLength={8}
        />
        <span className="mt-1 block text-xs text-muted">At least 8 characters.</span>
      </label>
      {password.length > 0 && (
        <label className="block">
          <span className="block text-sm font-medium">Confirm new password</span>
          <PasswordField
            name="password_confirm"
            value={passwordConfirm}
            onChange={setPasswordConfirm}
            required
            autoComplete="new-password"
            minLength={8}
            className={mismatch ? "border-red-400" : "border-ink/15"}
          />
          {mismatch && (
            <span className="mt-1 block text-xs text-red-700">Passwords don&rsquo;t match.</span>
          )}
        </label>
      )}
      {state?.error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || mismatch}
        className="w-full rounded-full bg-accent px-6 py-3 text-paper font-medium hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
      >
        {pending ? "…" : "Save new password"}
      </button>
    </form>
  );
}
