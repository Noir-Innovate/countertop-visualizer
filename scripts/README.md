# Scripts

## Migrate PostHog analytics to Supabase

One-off migration of manually captured analytics events from PostHog into `analytics_events` in Supabase.

**Requirements:** `.env.local` (or env) with:

- `POSTHOG_API_KEY` (Personal API Key with query access)
- `POSTHOG_PROJECT_ID` (optional; script can fetch from API)
- `NEXT_PUBLIC_POSTHOG_HOST` (e.g. `https://us.i.posthog.com`)
- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (for insert; not needed for `--dry-run`)

**Run from project root:**

```bash
# Install tsx if needed: npm i -D tsx
npm run migrate:posthog
# or
npx tsx scripts/migrate-posthog-to-supabase.ts
```

**Options:**

- `--dry-run` – Fetch from PostHog and log counts/sample only; no Supabase inserts.
- `--since=YYYY-MM-DD` – Only migrate events on or after this date (incremental runs).

**Events migrated:** All app-captured event names (e.g. `page_view`, `slab_selected`, `quote_submitted`, `lead_form_submitted`, `material_viewed`, …). `ab_test_*` events are not migrated. Each row is mapped with `event_type`, `created_at`, `session_id` (distinct_id), `material_line_id` / `organization_id` and UTM/tags from properties.

**Note:** Running the script multiple times without `--since` will insert duplicates. Use `--since=` for incremental backfills, or run once for a full migration.

---

## Upload Images to Supabase Storage

To upload the countertop images to Supabase storage:

1. Get your Supabase Service Role Key from your Supabase dashboard:
   - Go to Settings > API
   - Copy the `service_role` key (not the anon key)

2. Run the upload script:

```bash
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here node scripts/upload-images.mjs
```

The script will:

- Create the `accent-countertops` bucket if it doesn't exist
- Upload all images from `public/accent-countertops-slabs/` to Supabase storage
- Display the public URLs for each uploaded image
