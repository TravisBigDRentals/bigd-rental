// Tiny redirect target BoldSign hits inside our embedded iframe after
// the renter signs. We use a client component because the only thing
// it needs to do is postMessage up to the parent window so the booking
// form can advance to the payment step.
import { SignedCallback } from "./signed-callback";

export default async function SignedCallbackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SignedCallback bookingId={id} />;
}
