import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Admin gate: only emails in BIGDS_ADMIN_EMAIL (comma-separated, lowercased)
// can access /admin/*. Customer auth uses the same auth.users table but
// regular customers must not be able to cross over into admin pages.
function parseAdminEmails(): Set<string> {
  const raw = process.env.BIGDS_ADMIN_EMAIL ?? "";
  return new Set(
    raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isLoginPage = path === "/admin/login";
  const adminEmails = parseAdminEmails();
  const isAdminUser = !!user?.email && adminEmails.has(user.email.toLowerCase());

  // Not signed in at all → bounce to admin login
  if (!user && !isLoginPage) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }

  // Signed in as a customer (non-admin) trying to access /admin/* → bounce home.
  // The customer probably arrived here by accident or curiosity; don't expose
  // the admin login page to them.
  if (user && !isAdminUser && !isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Signed in as admin while sitting on the login page → go to bookings.
  if (user && isAdminUser && isLoginPage) {
    return NextResponse.redirect(new URL("/admin/bookings", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
