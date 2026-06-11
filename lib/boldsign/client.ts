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

// Surface useful detail from BoldSign API errors. Their SDK throws
// HttpError instances whose body has the structured error message.
export function extractBoldSignError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { body?: unknown; message?: unknown; response?: { body?: unknown } };
    const body = e.body ?? e.response?.body;
    if (body) {
      if (typeof body === "string") return body;
      try {
        const parsed = body as { message?: string; error?: string };
        if (parsed.message) return parsed.message;
        if (parsed.error) return parsed.error;
        return JSON.stringify(body);
      } catch {
        // fall through
      }
    }
    if (typeof e.message === "string") return e.message;
  }
  return "BoldSign API error";
}
