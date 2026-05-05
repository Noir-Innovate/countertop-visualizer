# Designer brief — Countertop Visualizer demo logo

## What it's for

A small wordmark/icon lockup that sits in the top-left of a public product demo page (`/demo`). It represents a generic "Countertop Visualizer" product (not a specific countertop fabricator brand), used so prospective customers can try the tool before signing up. Needs to feel neutral and professional so it doesn't compete visually with the customer-uploaded photos that fill the rest of the page.

## Deliverable

- **One SVG file**, named `demo-logo.svg`.
- Optimized (run through SVGO or similar — no editor metadata, no embedded fonts; convert text to outlined paths).
- Single color, pure black (`#000000`), no gradients or effects. We may need to recolor it later, so keep it as one flat shape/path group.
- Transparent background.
- ViewBox roughly `0 0 200 40` (≈5:1 aspect) — it renders at ~32px tall in the header. If an icon-only mark is included alongside a wordmark, keep the icon left of the text and aligned to the same baseline.

## Style

- Clean, modern, minimal. Think Linear, Vercel, Stripe — geometric, confident, not decorative.
- Sans-serif wordmark. Inter, Geist, or similar neutral grotesk. Medium or semibold weight.
- Optional small icon mark to the left of the wordmark — something abstract that hints at "stone slab," "surface," or "kitchen counter" without being literal. A simple geometric form (e.g. a tilted rectangle, two stacked planes, a corner profile) works better than a kitchen illustration.
- Text reads: **Countertop Visualizer**

## Constraints

- Must look crisp at 24px tall (small header) and at 200px tall (marketing screenshots).
- Must read clearly on a pure white background and on a light gray (`#f8fafc`) background.
- No photographic or 3D elements. No drop shadows. No outlined text.
- Avoid anything that resembles a specific real brand's logo.

## Variants (nice to have, not required)

- A square icon-only version (`demo-logo-mark.svg`, viewBox `0 0 40 40`) for favicon/social card use.
- A horizontal lockup with the wordmark right of the icon (the primary deliverable) and a stacked version with the icon above the wordmark.

## How we'll use it

The SVG file gets dropped into the project's `public/` folder and referenced as `/demo-logo.svg`. No code changes needed beyond pointing one constant at the new path. The designer doesn't need access to the codebase.
