# Big D's Rental — Booking Platform

Online rental booking for Big D's Rental Co. (Calgary, AB). Customers book
equipment, sign rental agreements, and pay online; admin tracks every rental
through delivery and return with signed handoffs and condition photos.

Project context, phased plan, and proposal: `~/Desktop/Big D/`.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase (Postgres + Storage + Auth) · Square (Web Payments SDK) · Resend · Dropbox Sign · Vercel

## Phase 1 — Foundation

You are here. To bring this up locally:

1. **Copy env template**
   ```bash
   cp .env.example .env.local
   ```
   Fill in the Phase 0 values (Supabase URL + publishable + secret keys, Square sandbox creds, Resend, Dropbox Sign).

2. **Run schema migration** in the Supabase SQL editor:
   - Paste contents of `supabase/migrations/0001_initial_schema.sql`
   - Run it

3. **Seed equipment data**, either:
   ```bash
   npx tsx scripts/seed.ts
   ```
   …or paste `supabase/seed.sql` in the SQL editor.

4. **Start the dev server**
   ```bash
   npm run dev
   ```
   Visit http://localhost:3000

## Deploying

Push to GitHub. Connect the repo to Vercel. Add all `.env.local` keys to the Vercel project settings (Production + Preview scopes). Auto-deploy fires on push to `main`.

## Layout

```
app/                      # Routes (server components by default)
  layout.tsx              # Root layout — fonts + brand
  page.tsx                # Landing
  globals.css             # Tailwind v4 + design tokens
lib/
  supabase/
    browser.ts            # Client-side Supabase client
    server.ts             # Server-side (RSC, route handlers)
    service.ts            # Service-role (server-only, bypasses RLS)
supabase/
  migrations/0001_*.sql   # Schema
  seed.sql                # Equipment + addons
scripts/seed.ts           # Programmatic seed
```

## Conventions

Money is integer cents. Status transitions come from webhooks, never the client. `NEXT_PUBLIC_*` is client-safe; everything else is server-only.
