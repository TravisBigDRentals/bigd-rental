# Review Checklist — Big D's Rental

Things to verify, test, and configure when you have time. Organized by urgency.

---

## 🔴 Required before client demo (Phase 2 + 4 gates)

### 1. Walk through the live booking flow end-to-end
URL: https://bigd-rental.vercel.app/book

- [ ] Step 1: pick a machine, set dates, pick attachments (test 0, 1, and 2 attachment selections — first is free, second is $40/day)
- [ ] Step 2: fill in all required fields, upload front AND back of DL (small image, JPG/PNG/PDF, < 10 MB each)
- [ ] Step 3: review screen shows correct totals + pricing breakdown
- [ ] Step 4: pay using Square sandbox card `4111 1111 1111 1111`, any future expiry, CVV `111`, postal `T2P 0A1`
- [ ] Lands on `/book/confirmed?id=...` showing status **booked**
- [ ] Validation: try to advance with missing fields — should show clear error
- [ ] Conflict: book same machine on overlapping dates — should get a 409 error message
- [ ] Returning customer: use the same email twice — second time, name/phone/address should pre-fill on email blur

### 2. Email delivery (Resend)
- [ ] Did the confirmation email arrive in your inbox? Subject: "Booking confirmed — Kubota ... "
- [ ] Note: sandbox sender `onboarding@resend.dev` only delivers to the email address that owns the Resend account
- [ ] If you want clients to receive it, you'll need to verify your domain in Resend before Phase 7 cutover

### 3. Database state sanity
- [ ] Supabase dashboard → Table editor → `bookings` — confirm test bookings show with status `booked`, `payment_intent_id` populated
- [ ] Storage → `customer-documents` bucket — DL uploads should be there as UUIDs

---

## 🟡 Required to unblock Phase 3 (signature)

### 4. Dropbox Sign — API App + Template
At https://app.hellosign.com → API:

- [ ] **Create API App** named `Big D's Rental — Web`
  - Add allowed domains: `bigd-rental.vercel.app` and `localhost`
  - Copy the **Client ID** → save to `.env.local` as `HELLOSIGN_CLIENT_ID=...` AND add to Vercel
- [ ] **Create an Embedded Template** for the rental agreement
  - Upload `BigDsRentalAgreement_Final v7 (2).docx` from `~/Desktop/Big D/`
  - Drag signature fields onto the doc where renters sign
  - Add merge fields named exactly:
    - `customer_full_name`
    - `equipment_name`
    - `equipment_serial`
    - `start_date`
    - `end_date`
    - `total_cad`
    - `project_address`
  - Save → copy **Template ID** → save as `HELLOSIGN_TEMPLATE_ID=...` in `.env.local` and Vercel

When both are in, ping Claude and Phase 3 (signature step between Review and Pay) gets built.

---

## 🟢 Recommended but not blocking

### 5. Square — register the production webhook
At https://developer.squareup.com → your app → **Webhooks** tab:

- [ ] Add subscription
  - Notification URL: `https://bigd-rental.vercel.app/api/square/webhook`
  - Event: `payment.updated`
- [ ] Copy the **Signature Key** Square generates
- [ ] Set `SQUARE_WEBHOOK_SIGNATURE_KEY=...` in `.env.local`
- [ ] Update the existing (empty) `SQUARE_WEBHOOK_SIGNATURE_KEY` row in Vercel — Production + Preview
- [ ] Trigger a redeploy in Vercel (or push any commit)

Why it matters: sync `payment.create` succeeds in our flow, but the webhook catches async events (refunds, chargebacks, disputes) and back-up confirms `COMPLETED` if the sync response was lost to a network blip. Not required for happy-path bookings to work.

### 6. Verify your `.env.local` and Vercel env vars match
Open `~/Desktop/Big D/bigds-rental/.env.local` and compare to Vercel → Settings → Environment Variables.

Should be the same keys with the same values. Don't worry if `HELLOSIGN_CLIENT_ID`, `HELLOSIGN_TEMPLATE_ID`, and `SQUARE_WEBHOOK_SIGNATURE_KEY` are blank for now — they fill in as you complete items 4 and 5 above.

---

## 🔵 For Phase 7 (production cutover) — defer

- [ ] Resend: verify your real sending domain (`bigdrentals.ca` or similar). Add SPF, DKIM, DMARC records via DNS
- [ ] Swap `RESEND_FROM_EMAIL` to real sending address (e.g. `bookings@bigdrentals.ca`)
- [ ] Square: switch from sandbox to production credentials in Vercel
  - New `SQUARE_ACCESS_TOKEN` (production)
  - New `NEXT_PUBLIC_SQUARE_APPLICATION_ID` (production version of same app)
  - New `NEXT_PUBLIC_SQUARE_LOCATION_ID` (Big D's actual store location)
  - Flip `SQUARE_ENVIRONMENT=production`
  - Re-register webhook in production environment
- [ ] Dropbox Sign: switch API key from test to production
- [ ] Set up Sentry or Vercel observability for error monitoring

---

## Open items / known issues

- [ ] `proposal.pdf` still mentions Stripe — needs to be re-exported with Square branding before next client-facing share
- [ ] DMS Square Developer App was set up under Big D's account (TravisBigDRentals). Long-term, consider whether agency wants its own dev app for cleaner separation
- [ ] Confirmation email currently doesn't attach the signed agreement PDF — that gets added in Phase 3
- [ ] No "cancel booking" or "reschedule" flow yet — Phase 5 admin will handle this server-side

---

## Code structure to glance through if curious

- `app/book/booking-form.tsx` — multi-step booking form (most complex file)
- `lib/pricing.ts` — money math, "first addon free" rule
- `lib/bookings/schema.ts` — Zod input validation for all API routes
- `supabase/migrations/*.sql` — schema source of truth
- `app/api/payments/charge/route.ts` — Square charge flow
- `app/api/square/webhook/route.ts` — async webhook handler

All money is integer cents. All status transitions originate from server (webhook or sync charge response), never trusted from client.
