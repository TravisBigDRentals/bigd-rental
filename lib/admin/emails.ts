// Helpers for the BIGDS_ADMIN_EMAIL env var.
//
// The env value is a COMMA-SEPARATED list (one or more emails). Auth
// gating treats it as a set; email senders generally want either
// "all of them" (Cc the whole team on admin notifications) or "just
// one" (single sandbox-redirect target, BoldSign sender identity).
// Centralised here so a future change (e.g. dropping the trial-period
// second admin) is a one-liner.

export function adminEmailList(): string[] {
  const raw = process.env.BIGDS_ADMIN_EMAIL ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// First admin email — used for cases that need a single canonical
// address (BoldSign sender identity, sandbox-mode customer-email
// redirect target, etc.).
export function firstAdminEmail(): string | undefined {
  return adminEmailList()[0];
}
