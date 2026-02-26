# Scripts

## Takeoff testbed

Local testbed for the takeoff prompt and image → SVG pipeline. Supports **Google (Gemini)** and **Anthropic (Claude)**. Uses the same logic as `app/api/takeoff` but runs locally so you can iterate on the prompt and compare providers/models/temperatures.

**Requirements:**

- **Google:** `GOOGLE_AI_API_KEY` in `.env.local` or environment.
- **Claude:** `ANTHROPIC_API_KEY` in `.env.local` or environment.

**Run from project root:**

```bash
# Default: Google, 4 runs, temp 0.2; output under takeoff-test-output/{image}/{company}/{model}/{temp}/
npx tsx scripts/takeoff-testbed.ts <image-path>

# Claude, 4 runs
npx tsx scripts/takeoff-testbed.ts ./Kitchen.jpg --provider claude

# Custom prompt, temperature, and run count
npx tsx scripts/takeoff-testbed.ts ./Kitchen.jpg --prompt scripts/prompts/takeoff-v5.md --temp 0.3 --runs 4

# Custom output directory
npx tsx scripts/takeoff-testbed.ts ./Kitchen.jpg --out-dir ./my-results
```

**Options:** `--out-dir`, `--prompt`, `--provider google|claude`, `--model <id>`, `--temp <0-1>`, `--runs <1-20>` (default: 4).

**Output layout (nothing overwritten):**

```
{out-dir}/{image-name}/{company}/{model}/{prompt-name}/{temp}/{prompt-name}-{x}.svg
{out-dir}/{image-name}/{company}/{model}/{prompt-name}/{temp}/{prompt-name}-{x}-raw.txt
{out-dir}/{image-name}/{company}/{model}/{prompt-name}/{temp}/{prompt-name}-{x}-notes.txt  (if present)
```

Example: `takeoff-test-output/Kitchen/Google/gemini-3-pro-preview/takeoff-v5/0.2/takeoff-v5-1.svg`. The `{prompt-name}` folder keeps each prompt version separate; `{x}` is the generation index (1, 2, 3, …).

**Prompt:** Edit `scripts/takeoff-testbed-prompt.md` to change the prompt, or pass `--prompt path/to/prompt.md`.

---

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
