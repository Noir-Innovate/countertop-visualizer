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
  -- tier/segment are OUTPUTS. 'unknown' is a first-class value: a row Owen
  -- can't qualify goes to 'unknown' rather than getting a guessed tier (SM-2).
  tier TEXT CHECK (tier IN ('A', 'B', 'C', 'unknown')),
  segment TEXT CHECK (segment IN ('warm', 'cold')),
  -- OD-7a: the INPUTS tier/segment are derived from. Real columns (not a JSONB
  -- blob) so import validation and /admin filtering can enforce/query them.
  business_type TEXT NOT NULL
    CHECK (business_type IN ('fabricator', 'stone_yard', 'kb_dealer',
      'design_showroom', 'remodeler', 'builder', 'flooring', 'other')),
  serves_homeowners BOOLEAN,
  has_showroom BOOLEAN,
  employee_count INTEGER,
  city TEXT,
  state TEXT,
  tier_rationale TEXT NOT NULL,
  relationship_note TEXT,
  -- Provenance is mandatory (see OD-3): every prospect must record where it
  -- came from and when it was sourced. No defaulting these.
  source_url TEXT NOT NULL,
  sourced_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'queued', 'contacted', 'replied',
                      'bounced', 'unsubscribed', 'suppressed')),
  -- OD-7b: per-prospect send state so the four-touches-then-stop, one-thread-
  -- per-prospect (no re-adding a non-replier), and 90-day rest rules are
  -- enforced by data, not by Owen remembering.
  sequence_step INTEGER NOT NULL DEFAULT 0,
  last_touch_at TIMESTAMPTZ,
  last_reply_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A warm prospect must document the existing relationship (SM-2). Enforced in
  -- the DB, not only at import.
  CONSTRAINT prospects_warm_requires_note CHECK (
    segment IS DISTINCT FROM 'warm'
    OR (relationship_note IS NOT NULL AND btrim(relationship_note) <> '')
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
