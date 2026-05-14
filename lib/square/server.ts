import "server-only";
import { SquareClient, SquareEnvironment } from "square";

let cached: SquareClient | null = null;

export function getSquareClient(): SquareClient {
  if (cached) return cached;

  const env = process.env.SQUARE_ENVIRONMENT === "production"
    ? SquareEnvironment.Production
    : SquareEnvironment.Sandbox;

  cached = new SquareClient({
    token: process.env.SQUARE_ACCESS_TOKEN!,
    environment: env,
  });
  return cached;
}

export function squareLocationId(): string {
  const id = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID;
  if (!id) throw new Error("NEXT_PUBLIC_SQUARE_LOCATION_ID is not set");
  return id;
}
