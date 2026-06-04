"use client";

import { useState } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  name?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: "current-password" | "new-password";
  className?: string;
};

// Password input with an inline show/hide toggle. Lets users verify
// what they typed without forcing a separate "confirm" workflow.
export function PasswordField({
  value, onChange, name, required, minLength, autoComplete = "new-password", className,
}: Props) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        className={`mt-1 w-full rounded-lg border bg-paper px-3 py-2 pr-11 ${className ?? "border-ink/15"}`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        className="absolute right-2 top-1/2 -translate-y-1/2 mt-0.5 flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-ink hover:bg-ink/5 transition-colors"
      >
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-6.5 0-10-7-10-7a19.5 19.5 0 0 1 4.22-5.36" />
      <path d="M9.9 4.24A10.05 10.05 0 0 1 12 4c6.5 0 10 7 10 7a19.6 19.6 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
