import { LoginForm } from "./login-form";

export const metadata = {
  title: "Admin sign in — Big D's Rental",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="font-mono text-xs tracking-widest text-muted uppercase">
          Big D&rsquo;s Rental — Admin
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Sign in</h1>
        <div className="mt-8">
          <LoginForm next={next ?? "/admin/bookings"} />
        </div>
      </div>
    </main>
  );
}
