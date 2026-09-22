-- Packet OD defect 49 — suppression scope (address vs whole business).
--
-- A hard bounce is a dead ADDRESS. An opt-out / complaint is a DECISION that
-- covers the whole BUSINESS — every address at that shop, including siblings
-- sourced months later. Rule 45 holds a second known contact at a business
-- rather than deleting them; without business scope, that held sibling gets
-- mailed after the 90-day rest and the person who said no hears about it down
-- the hall. The scope is an explicit column, never inferred from `reason`, so a
-- suppression row means exactly one thing regardless of who reads it. This is
-- the list where being wrong is worst.
--
-- SEPARATE from 074: apply AFTER 073/074/075 and the PR-1 merge. Enforcement
-- (send guard refuses commercial sends to an address sharing a dedupe_key with a
-- business-scoped suppression; import treats a newly-sourced row at a
-- business-suppressed dedupe_key as suppressed; business scope is
-- commercial-only) lives in code, shipped with the OD-4 / defect-42 batch.

ALTER TABLE public.suppression
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'address'
    CHECK (scope IN ('address', 'business'));

-- The business a business-scoped row applies to: the prospect dedupe_key (the
-- website's registrable root domain; see 074 prospects.dedupe_key). NULL for
-- address-scoped rows. Recorded when an opt-out / complaint is written so the
-- send guard and the importer can match ANY address at that business.
ALTER TABLE public.suppression
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

-- Fast "is there a business-scoped suppression for this dedupe_key?" lookup,
-- for both the send guard and import.
CREATE INDEX IF NOT EXISTS suppression_business_dedupe_idx
  ON public.suppression (dedupe_key)
  WHERE scope = 'business' AND dedupe_key IS NOT NULL;

COMMENT ON COLUMN public.suppression.scope IS
  'address = this address only (e.g. hard_bounce, blocks all classes); '
  'business = every address at the dedupe_key business (opt-out/complaint), '
  'commercial-only so it never blocks transactional mail.';
