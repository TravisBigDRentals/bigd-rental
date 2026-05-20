import { CustomerAuthForm } from "./sign-in-form";

export const metadata = {
  title: "Sign in — Big D's Rental Co.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="font-mono text-xs tracking-widest text-muted uppercase">
          Big D&rsquo;s Rental
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Customer sign in
        </h1>
        <p className="mt-3 text-sm text-muted">
          Sign in to pre-fill your info on future bookings. Booking without an
          account is also fine — just start from the home page.
        </p>
        <div className="mt-8">
          <CustomerAuthForm next={next ?? "/book"} />
        </div>
      </div>
    </main>
  );
}
