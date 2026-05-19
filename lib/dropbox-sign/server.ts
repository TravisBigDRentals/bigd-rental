import "server-only";
import * as DropboxSign from "@dropbox/sign";

function withKey<T extends { username: string }>(api: T): T {
  const key = process.env.HELLOSIGN_API_KEY;
  if (!key) throw new Error("HELLOSIGN_API_KEY is not set");
  api.username = key;
  return api;
}

export function signatureRequestApi(): DropboxSign.SignatureRequestApi {
  return withKey(new DropboxSign.SignatureRequestApi());
}

export function embeddedApi(): DropboxSign.EmbeddedApi {
  return withKey(new DropboxSign.EmbeddedApi());
}

export function templateId(): string {
  const id = process.env.HELLOSIGN_TEMPLATE_ID;
  if (!id) throw new Error("HELLOSIGN_TEMPLATE_ID is not set");
  return id;
}

export function clientId(): string {
  const id = process.env.HELLOSIGN_CLIENT_ID;
  if (!id) throw new Error("HELLOSIGN_CLIENT_ID is not set");
  return id;
}
