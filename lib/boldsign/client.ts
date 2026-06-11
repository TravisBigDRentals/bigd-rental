import "server-only";
import { DocumentApi, TemplateApi } from "boldsign";

// BoldSign uses X-API-KEY header auth. Region matters — Canadian accounts
// (app-ca.boldsign.com) need to hit api-ca.boldsign.com. The region URL
// lives in BOLDSIGN_API_BASE_URL so we can switch by env var alone.

function apiKey(): string {
  const k = process.env.BOLDSIGN_API_KEY;
  if (!k) throw new Error("BOLDSIGN_API_KEY is not set");
  return k;
}

function baseUrl(): string {
  return process.env.BOLDSIGN_API_BASE_URL ?? "https://api.boldsign.com";
}

export function templateApi(): TemplateApi {
  const api = new TemplateApi();
  api.basePath = baseUrl();
  // SDK exposes one API key auth; populate the API_KEY value.
  api.setApiKey(apiKey());
  return api;
}

export function documentApi(): DocumentApi {
  const api = new DocumentApi();
  api.basePath = baseUrl();
  api.setApiKey(apiKey());
  return api;
}

export function templateId(): string {
  const id = process.env.BOLDSIGN_TEMPLATE_ID;
  if (!id) throw new Error("BOLDSIGN_TEMPLATE_ID is not set");
  return id;
}

// First admin email (BIGDS_ADMIN_EMAIL is comma-separated). Used as the
// SENDER role's signer email — BoldSign requires a value there even
// though SENDER doesn't actually sign.
export function senderEmail(): string {
  const raw = process.env.BIGDS_ADMIN_EMAIL ?? "";
  const first = raw.split(",")[0]?.trim();
  return first || "noreply@bigdrentals.ca";
}

// Surface useful detail from BoldSign API errors. The SDK uses axios
// internally, so error responses come as axios error objects with the
// useful payload on `response.data`.
export function extractBoldSignError(err: unknown): string {
  if (!err || typeof err !== "object") return "BoldSign API error";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any;
  const dataCandidates: unknown[] = [
    e.response?.data,
    e.response?.body,
    e.body,
  ];
  for (const data of dataCandidates) {
    if (!data) continue;
    if (typeof data === "string") return data;
    if (typeof data === "object") {
      const d = data as Record<string, unknown>;
      if (typeof d.message === "string") return d.message as string;
      if (typeof d.error === "string") return d.error as string;
      if (typeof d.error_description === "string") return d.error_description as string;
      // Structured field-level errors
      if (Array.isArray(d.errors)) return JSON.stringify(d.errors);
      try { return JSON.stringify(data); } catch { /* noop */ }
    }
  }
  if (typeof e.message === "string") return e.message as string;
  return "BoldSign API error";
}
