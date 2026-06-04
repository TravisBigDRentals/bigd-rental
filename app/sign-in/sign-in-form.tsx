"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { customerSignInAction, customerSignUpAction } from "./actions";
import { PasswordField } from "@/components/password-field";

type Mode = "signin" | "signup";

export function CustomerAuthForm({ next, initialMode = "signin" }: { next: string; initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const action = mode === "signin" ? customerSignInAction : customerSignUpAction;
  const [state, formAction, pending] = useActionState(action, null);
  const confirmMismatch = mode === "signup" && !!passwordConfirm && passwordConfirm !== password;

  return (
    <div>
      <div className="flex gap-2 mb-6 font-mono text-xs uppercase tracking-widest">
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={`px-3 py-1.5 rounded-full transition-colors ${
            mode === "signin" ? "bg-ink text-paper" : "border border-ink/15 text-muted hover:text-ink"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`px-3 py-1.5 rounded-full transition-colors ${
            mode === "signup" ? "bg-ink text-paper" : "border border-ink/15 text-muted hover:text-ink"
          }`}
        >
          Create account
        </button>
      </div>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
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
        <label className="block">
          <span className="block text-sm font-medium">Password</span>
          <PasswordField
            name="password"
            value={password}
            onChange={setPassword}
            required
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={mode === "signup" ? 8 : undefined}
          />
          {mode === "signup" && (
            <span className="mt-1 block text-xs text-muted">At least 8 characters.</span>
          )}
          {mode === "signin" && (
            <div className="mt-2 text-right">
              <Link href="/sign-in/forgot" className="text-xs text-muted underline hover:text-ink">
                Forgot password?
              </Link>
            </div>
          )}
        </label>
        {mode === "signup" && password.length > 0 && (
          <label className="block">
            <span className="block text-sm font-medium">Confirm password</span>
            <PasswordField
              name="password_confirm"
              value={passwordConfirm}
              onChange={setPasswordConfirm}
              required
              autoComplete="new-password"
              minLength={8}
              className={confirmMismatch ? "border-red-400" : "border-ink/15"}
            />
            {confirmMismatch && (
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
          disabled={pending || confirmMismatch}
          className="w-full rounded-full bg-accent px-6 py-3 text-paper font-medium hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {pending ? "…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-xs text-muted">
        {mode === "signin"
          ? "Don’t have an account? Click \"Create account\" above."
          : "Your info will be saved so you can book faster next time. You can still book without an account from the home page."}
      </p>
    </div>
  );
}
