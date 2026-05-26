# E2E tests

Playwright specs that drive the app in a real browser against your **local
Supabase** and **Stripe test mode**.

## Prereqs

In `.env.local` (or `.env`):

- `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` (or your local URL)
- `SUPABASE_SERVICE_ROLE_KEY=<service role key from supabase status>`
- `STRIPE_SECRET_KEY=sk_test_...` (test mode — the helper refuses live keys)
- `STRIPE_INTERNAL_PLAN_PRICE_ID=price_...` (your $250/mo test price)

Make sure local Supabase is up: `supabase start`.

## Running

```
# Lets Playwright spawn the dev server (with SCRAPE_MOCK_FIXTURES=1 set):
npm run test:e2e

# Or, if you already have `npm run dev` running yourself:
SKIP_WEBSERVER=1 SCRAPE_MOCK_FIXTURES=1 npm run test:e2e
```

Headed / debug:

```
npm run test:e2e -- --headed
npm run test:e2e -- --ui
npm run test:e2e -- e2e/onboarding-promo.spec.ts
```

## What's covered

- **onboarding-signup.spec.ts** — submitting the signup form lands on the
  create-organization step.
- **onboarding-promo.spec.ts** — `TEST20` promo (auto-created by global
  setup) applies even when typed lowercase, pricing block updates, invalid
  codes show an error.
- **onboarding-scrape.spec.ts** — submitting a website URL kicks off a
  scrape, and the row reaches `complete` status (uses the mocked scrape
  pipeline, see below).
- **sales-*.spec.ts** — pre-existing salesperson permission tests.

## Mocks

- **Scraping**: `SCRAPE_MOCK_FIXTURES=1` short-circuits the FireCrawl +
  Gemini calls in `app/api/onboarding/scrape/route.ts` and writes a
  deterministic fixture instead. Playwright sets this on its spawned web
  server automatically.
- **Stripe**: real test-mode API. `globalSetup` ensures a `TEST20` 20%-off
  coupon + promotion code exists (idempotent).

## Cleanup

Each onboarding spec creates a fresh user via `testUser` fixture and deletes
it (cascading org + scrape + billing rows) in `afterEach`. The sales seed
also cleans up via `globalTeardown`.

Test-mode Stripe subscriptions created by the trial-completion path are
tagged with `metadata.e2e: "1"` for periodic manual cleanup.
