@AGENTS.md

# Big D's Rental — In-Repo Orientation

The canonical project orientation, phased build plan, and proposal live one
level up at `~/Desktop/Big D/`. Read those first.

- `../CLAUDE (2).md` — project orientation, decisions, gaps in old scaffold
- `../build-checklist.md` — phased plan, Phase 0 → Phase 8
- `../proposal.pdf` — 2-page client deck

## In-repo conventions

- Next.js 16 App Router, TypeScript strict, Tailwind v4 (CSS-first via `@theme`).
- Supabase clients separated by environment:
  - `lib/supabase/browser.ts` — anon/publishable key, client components
  - `lib/supabase/server.ts` — anon/publishable key, server components (uses `cookies()` for session)
  - `lib/supabase/service.ts` — service role key, **server-only** (uses `import "server-only"`)
- Payments via **Square Web Payments SDK** (inline card field, tokenized client-side) + the `square` Node SDK server-side. Not Stripe — client preference.
- API routes under `app/api/*`. Webhook handlers (`square/webhook`, `dropboxsign/webhook`) read raw body via `request.text()` before signature verification — never `request.json()` first.
- Money stored as integer cents everywhere. Never floats.
- Status transitions only fire from webhooks. Client-side success indicators are never trusted.
- All env vars not prefixed `NEXT_PUBLIC_` are server-only — never read them from a client component.

## Phase 1 deliverables (this commit)

- Deployable Next.js shell at `app/`
- Brand tokens in `app/globals.css` (ink #0F1114, paper #F5F2EC, accent #D4891A; DM Sans / Syne / Space Mono)
- Supabase clients (browser, server, service)
- Schema migration at `supabase/migrations/0001_initial_schema.sql` — tables, enums, RLS, `check_double_booking()` trigger
- Seed at `supabase/seed.sql` and programmatic alternative at `scripts/seed.ts`
- `.env.example` listing all Phase 0 keys

Nothing for Phase 2+ is in this commit. Don't add it until those phases start.
