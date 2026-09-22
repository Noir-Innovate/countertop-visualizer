-- Packet OD — Outbound cold-email data layer (critical path).
-- Creates: outbound_campaigns, prospects (both org-scoped, RLS via
-- organization_members like 068_salesperson_portal.sql) and suppression
-- (GLOBAL, permanent, admin/service-role only, like 073_internal_tasks.sql).
--
-- Suppression is the single safety net for autonomous sending. It is
-- deliberately NOT tenant-scoped: an unsubscribe / hard bounce / complaint
-- must suppress that address everywhere, forever. Do not add per-org or
-- per-campaign scoping to it, and do not add an expiry.
--
-- Email is stored normalised (lowercase + trimmed) by the app; the unique
-- indexes are on lower(email) so a case difference can never defeat them.

-- ============================================================
-- Shared updated_at trigger for this packet's tables
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_outbound_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================
-- Normalise email on write (trim + lowercase).
-- Guarantees the stored value always equals normalizeEmail() in
-- lib/email-suppression.ts, so the send guard's exact-match lookup and the
-- lower(email) unique indexes can never be defeated by casing/whitespace,
-- even for rows inserted outside the app.
-- ============================================================
CREATE OR REPLACE FUNCTION public.normalize_email_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.email = lower(btrim(NEW.email));
  RETURN NEW;
END;
$$;

-- ============================================================
-- 1) outbound_campaigns  (org-scoped)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.outbound_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'done')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outbound_campaigns_org_status_idx
  ON public.outbound_campaigns (organization_id, status);

DROP TRIGGER IF EXISTS outbound_campaigns_updated_at ON public.outbound_campaigns;
CREATE TRIGGER outbound_campaigns_updated_at
  BEFORE UPDATE ON public.outbound_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_outbound_updated_at();

ALTER TABLE public.outbound_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on outbound_campaigns"
  ON public.outbound_campaigns
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Org owners/admins read outbound_campaigns"
  ON public.outbound_campaigns
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE profile_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ============================================================
-- 2) prospects  (org-scoped; provenance mandatory)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.outbound_campaigns(id) ON DELETE SET NULL,
  company TEXT,
  contact_name TEXT,
  email TEXT NOT NULL,
  role TEXT,
  website TEXT,
  -- Role desk (info@/sales@) vs a named person: different tone, different bounce
  -- risk. Owen wants to know which he's writing to before he writes.
  email_kind TEXT
    CHECK (email_kind IN ('role_info', 'role_sales', 'role_other', 'named_person')),
  -- tier/segment are OUTPUTS. 'unknown' is a first-class value: a row Owen
  -- can't qualify goes to 'unknown' rather than getting a guessed tier (SM-2).
  tier TEXT CHECK (tier IN ('A', 'B', 'C', 'unknown')),
  segment TEXT CHECK (segment IN ('warm', 'cold')),
  -- OD-7a/OD-8a: the INPUTS tier/segment are derived from. Real columns (not a
  -- JSONB blob) so import validation and /admin filtering can query them.
  -- Nullable per OD-8a + Mara's fold rule: the sourcing tool fills what it
  -- observes and leaves the rest blank (a visible blank beats a guess).
  -- "business_type present" for a MAILABLE row is enforced in the import path +
  -- send guard, NOT by a NOT NULL that would trap the not-yet-built importer.
  business_type TEXT
    CHECK (business_type IN ('fabricator', 'stone_yard', 'kb_dealer',
      'design_showroom', 'remodeler', 'builder', 'flooring', 'other')),
  serves_homeowners BOOLEAN,
  has_showroom BOOLEAN,
  employee_count INTEGER,
  -- Which proxy the count came from (SM-2): a countable staff page is stronger
  -- evidence than a square-footage inference. Makes the tier call auditable.
  employee_count_basis TEXT
    CHECK (employee_count_basis IN ('stated_site', 'linkedin_band',
      'gbp_reviews', 'facility_evidence', 'none')),
  city TEXT,
  state TEXT,
  -- IANA zone name (America/Chicago, America/Phoenix), resolved from city+state
  -- with a tz database — never a state->offset lookup (Arizona ignores DST; DST
  -- ends 2026-11-01 mid-campaign). Drives the prospect-local send window,
  -- converted at send time.
  timezone TEXT,
  -- tier / tier_rationale / segment / relationship_note are HUMAN calls made
  -- after sourcing (SM-2 Part 1); the sourcing tool must never populate them, so
  -- tier_rationale is nullable — a NOT NULL here would reject every sourced row.
  tier_rationale TEXT,
  relationship_note TEXT,
  -- Which of the three distinct things 'warm' can mean; they are not equally
  -- self-evidencing. 'referral_consented' is set ONLY from Jeremiah's per-person
  -- confirmation (the importer rejects it otherwise, never infers it from note
  -- text); an unconfirmed referral imports as cold.
  relationship_kind TEXT
    CHECK (relationship_kind IN ('direct_prior', 'inbound', 'referral_consented')),
  -- Provenance is mandatory (see OD-3): every prospect must record where it
  -- came from and when it was sourced. No defaulting these.
  source_url TEXT NOT NULL,
  -- The literal text surrounding the address on source_url — the audit trail
  -- that it was published for business contact. "Present for a mailable row" is
  -- enforced in the import path, not by a constraint.
  source_excerpt TEXT,
  sourced_at TIMESTAMPTZ NOT NULL,
  -- robots.txt allowance recorded at fetch time. robots_allowed = false => never
  -- mailed; that gate lives in the import path + send guard, not a constraint.
  robots_allowed BOOLEAN,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'queued', 'contacted', 'replied',
                      'bounced', 'unsubscribed', 'suppressed')),
  -- OD-7b: per-prospect send state so the four-touches-then-stop, one-thread-
  -- per-prospect (no re-adding a non-replier), and 90-day rest rules are
  -- enforced by data, not by Owen remembering.
  -- sequence_step and last_touch_at advance ONLY on a confirmed send (the same
  -- write that logs the send) — never on enqueue or schedule — so the touch
  -- count and the 90-day rest clock can't drift toward contacting someone we
  -- shouldn't. next_touch_due holds the SCHEDULED date separately, so
  -- capacity-vs-cadence drift is measurable instead of invisible.
  sequence_step INTEGER NOT NULL DEFAULT 0,
  last_touch_at TIMESTAMPTZ,
  next_touch_due TIMESTAMPTZ,
  last_reply_at TIMESTAMPTZ,
  -- OD-8a personalisation OBSERVATIONS: the raw fact + the exact page it came
  -- from. The sourcing tool returns observation + URL and MUST NOT draft prose —
  -- a generated line reads as verified when nobody verified it.
  personalization_observation TEXT,
  personalization_url TEXT,
  personalization_observed_at TIMESTAMPTZ,
  personalization_kind TEXT
    CHECK (personalization_kind IN ('gallery_project', 'catalogue_depth',
      'written_commitment', 'equipment_process', 'none')),
  -- OD-8a disqualification: returned MARKED, never silently dropped, so hit rate
  -- is measurable and a dead shop isn't re-sourced next month.
  disqualified BOOLEAN NOT NULL DEFAULT false,
  disqualify_reason TEXT
    CHECK (disqualify_reason IN ('commercial_only', 'trade_wholesale',
      'no_website', 'unusable_site', 'franchise', 'installer_no_showroom',
      'out_of_area')),
  -- dedupe_key: derived from `website` (the business's registrable root domain),
  -- NEVER from the email address's domain. Normalisation: lowercase, strip
  -- scheme, strip leading 'www.', strip trailing dot/slash, registrable domain
  -- (e.g. "https://WWW.AcmeStone.com/contact" -> "acmestone.com").
  -- Why website, not email: a warm row may carry a personal address
  -- (john@gmail.com) while a sourced row carries info@acmestone.com for the SAME
  -- shop. Email-domain keys ('gmail.com' vs 'acmestone.com') don't collide, so
  -- the same human would get a warm AND a cold thread in parallel — breaking
  -- one-thread-per-prospect. Keying on the website domain collapses both.
  -- Dedupe runs in the import path against prospects AND suppression (NOT a DB
  -- unique constraint), so an import reports a collapse rather than erroring.
  dedupe_key TEXT,
  -- OD-8a address verification result, landed on the row at import (the check
  -- itself is a separate step/vendor). Only 'valid' sends during the ramp —
  -- enforced in the send guard, not here. Defaults to 'unknown' so an unverified
  -- row is never mistaken for 'valid'.
  email_verified TEXT NOT NULL DEFAULT 'unknown'
    CHECK (email_verified IN ('valid', 'invalid', 'risky', 'unknown')),
  verified_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A warm prospect must document BOTH which kind of relationship it is and the
  -- note (SM-2). Only triggers when a human sets segment='warm'; sourced rows
  -- (segment NULL) pass untouched, so this never rejects a sourcing-only row.
  CONSTRAINT prospects_warm_requires_note CHECK (
    segment IS DISTINCT FROM 'warm'
    OR (
      relationship_kind IS NOT NULL
      AND relationship_note IS NOT NULL
      AND btrim(relationship_note) <> ''
    )
  )
);

-- One prospect record per email per org. lower(email) so casing never defeats
-- the uniqueness (OD-1). Import (OD-3) dedupes against this.
CREATE UNIQUE INDEX IF NOT EXISTS prospects_org_email_key
  ON public.prospects (organization_id, lower(email));

CREATE INDEX IF NOT EXISTS prospects_campaign_idx
  ON public.prospects (campaign_id);
CREATE INDEX IF NOT EXISTS prospects_org_status_idx
  ON public.prospects (organization_id, status);

DROP TRIGGER IF EXISTS prospects_updated_at ON public.prospects;
CREATE TRIGGER prospects_updated_at
  BEFORE UPDATE ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.set_outbound_updated_at();

DROP TRIGGER IF EXISTS prospects_normalize_email ON public.prospects;
CREATE TRIGGER prospects_normalize_email
  BEFORE INSERT OR UPDATE OF email ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.normalize_email_column();

ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on prospects"
  ON public.prospects
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Org owners/admins read prospects"
  ON public.prospects
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE profile_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ============================================================
-- 3) suppression  (GLOBAL, permanent, service-role only)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.suppression (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  reason TEXT NOT NULL
    CHECK (reason IN ('unsubscribed', 'hard_bounce', 'manual', 'complaint')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Global uniqueness on the normalised address. This is what the shared send
-- guard matches against.
CREATE UNIQUE INDEX IF NOT EXISTS suppression_email_key
  ON public.suppression (lower(email));

DROP TRIGGER IF EXISTS suppression_normalize_email ON public.suppression;
CREATE TRIGGER suppression_normalize_email
  BEFORE INSERT OR UPDATE OF email ON public.suppression
  FOR EACH ROW EXECUTE FUNCTION public.normalize_email_column();

ALTER TABLE public.suppression ENABLE ROW LEVEL SECURITY;

-- No client policies: service role only via API (mirrors internal_tasks and the
-- other admin-only tables). Suppression must never be readable/writable by a
-- tenant session.

COMMENT ON TABLE public.suppression IS
  'Global permanent do-not-email list. Matched on lower(email) by the shared '
  'send guard (lib/email-suppression.ts). Never tenant-scoped, never expires.';

-- ============================================================
-- 4) outbound_send_log  (OD-7b — domain-wide send counter)
-- ============================================================
-- One row per recipient actually sent to, across EVERY from-address on the
-- domain. The warmup ramp is a whole-domain number (10/day = 10 from the box,
-- not 10 each from rae@ and owen@), so the shared send guard counts this table
-- to enforce the daily ceiling and the per-address hourly rate. Every send is
-- logged (commercial and transactional) so the count reflects real volume;
-- the guard only BLOCKS commercial sends once a cap is hit.
CREATE TABLE IF NOT EXISTS public.outbound_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  message_class TEXT NOT NULL
    CHECK (message_class IN ('commercial', 'transactional')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Domain-wide "today" total: a single index-backed count over sent_at.
CREATE INDEX IF NOT EXISTS outbound_send_log_sent_at_idx
  ON public.outbound_send_log (sent_at);
-- Per-address hourly rate.
CREATE INDEX IF NOT EXISTS outbound_send_log_from_sent_idx
  ON public.outbound_send_log (from_address, sent_at);

ALTER TABLE public.outbound_send_log ENABLE ROW LEVEL SECURITY;

-- No client policies: service role only (the guard writes it; admin/agent
-- reads go through service-role APIs).

COMMENT ON TABLE public.outbound_send_log IS
  'Every outbound recipient send, domain-wide. Source of the daily ceiling and '
  'per-address hourly rate enforced in lib/send-rate-limit.ts.';

-- ============================================================
-- 5) outbound_events  (OD-4 / OD-9 — delivery-result + engagement)
-- ============================================================
-- What happened to a send AFTER it left: bounces, complaints, replies,
-- unsubscribes. Domain-wide, never per-address: a HALT stops the whole domain,
-- so the measurement must match the response (1 bounce in 28 is a HOLD to one
-- sender while the domain is at 2 in 56, a HALT). The Resend webhook (OD-4) and
-- the SMTP path (OD-9) both write here through the SAME classifier.
--
-- Bounce severity is classified by ENHANCED status code, not by 5xx bucketing:
--   5.1.x addressing / no such user -> hard_bounce
--   5.7.x policy / reputation / blocked -> policy_rejection (HALT path; NEVER a
--         hard bounce — bucketing it as one silently downgrades our most severe
--         trigger into our most lenient)
--   5.2.2 mailbox full -> soft_bounce
--   4.x.x -> soft_bounce
--   ambiguous -> policy_rejection (severe side; a false halt costs two days, a
--         silent downgrade costs the domain)
-- raw_code and raw_text are stored so the classification is always re-derivable
-- and auditable. The classifier itself lives in code (OD-4), shared by both
-- transports.
CREATE TABLE IF NOT EXISTS public.outbound_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES public.prospects(id) ON DELETE SET NULL,
  from_address TEXT,
  to_address TEXT NOT NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('delivered', 'soft_bounce', 'hard_bounce',
      'policy_rejection', 'complaint', 'reply', 'unsubscribe')),
  -- The raw evidence the classification was derived from.
  raw_code TEXT,
  raw_text TEXT,
  provider TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Domain-wide trailing-window counts by type (bounce/complaint rate, HALT/HOLD).
CREATE INDEX IF NOT EXISTS outbound_events_type_time_idx
  ON public.outbound_events (event_type, occurred_at);
CREATE INDEX IF NOT EXISTS outbound_events_to_idx
  ON public.outbound_events (to_address);

ALTER TABLE public.outbound_events ENABLE ROW LEVEL SECURITY;

-- No client policies: service role only (webhook writes; admin/agent reads via
-- service-role APIs).

COMMENT ON TABLE public.outbound_events IS
  'Domain-wide delivery-result + engagement events. Bounce severity derives from '
  'the enhanced status code (raw_code), never 5xx bucketing; 5.7.x is '
  'policy_rejection and halts, never counted as a hard bounce.';
