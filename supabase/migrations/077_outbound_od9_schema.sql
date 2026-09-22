-- Packet OD-9b — schema for the SMTP cold sender + cold inbound ingestion.
-- Additive only. Does NOT touch frozen 074. Apply AFTER 073/074/075, the PR-1
-- merge, and 076. The enforcement/ingestion code (9a effects, 9c ingestion,
-- 9d sender+guard) ships separately and reads/writes these.

-- ============================================================
-- outbound_send_log: cold/warm marker + per-message reputation evidence
-- ============================================================
-- send_kind separates COLD from WARM within commercial (message_class can't:
-- warm outreach is commercial too). Needed for the 250-cumulative-COLD gate.
ALTER TABLE public.outbound_send_log
  ADD COLUMN IF NOT EXISTS send_kind TEXT
    CHECK (send_kind IN ('cold', 'warm', 'transactional'));

-- Best available live reputation signal (defect: complaints are mostly
-- unobservable for our business-mailbox list, so per-provider deferral/block
-- rates are the shadow we CAN see). Captured from message one — retrofitting
-- loses the baseline. Provider derived from the recipient domain's MX.
ALTER TABLE public.outbound_send_log
  ADD COLUMN IF NOT EXISTS receiving_provider TEXT;
-- The full SMTP response line (accepted / deferred / rejected), not a status
-- enum — the enum throws away exactly the reputation detail we need.
ALTER TABLE public.outbound_send_log
  ADD COLUMN IF NOT EXISTS smtp_response TEXT;

CREATE INDEX IF NOT EXISTS outbound_send_log_kind_sent_idx
  ON public.outbound_send_log (send_kind, sent_at);

-- ============================================================
-- outbound_events: human disposition of inbound (for the attestation fact-check)
-- ============================================================
-- A reply is undispositioned until the operator classifies it. The send guard
-- refuses campaign dispatch if any inbound on an active thread is still
-- undispositioned past the day's first scheduled send (attestation = intent;
-- this = fact).
ALTER TABLE public.outbound_events
  ADD COLUMN IF NOT EXISTS disposition TEXT;
ALTER TABLE public.outbound_events
  ADD COLUMN IF NOT EXISTS dispositioned_at TIMESTAMPTZ;
ALTER TABLE public.outbound_events
  ADD COLUMN IF NOT EXISTS dispositioned_by TEXT;

-- Fast "is there undispositioned inbound older than T?" lookup.
CREATE INDEX IF NOT EXISTS outbound_events_undispositioned_idx
  ON public.outbound_events (occurred_at)
  WHERE dispositioned_at IS NULL;

-- ============================================================
-- outbound_send_attestations: same-day "I am present" per sending address
-- ============================================================
-- The deliberate act that records the operator is present today. One per
-- sending address per day; the guard refuses that address's campaign dispatch
-- without it. Records intent; the disposition check above enforces the fact.
CREATE TABLE IF NOT EXISTS public.outbound_send_attestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sending_address TEXT NOT NULL,
  attested_for_date DATE NOT NULL,
  attested_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sending_address, attested_for_date)
);

ALTER TABLE public.outbound_send_attestations ENABLE ROW LEVEL SECURITY;
-- Service role only.

-- ============================================================
-- outbound_ramp_gates: recorded release of the 250 cumulative-cold gate
-- ============================================================
-- The 250-cumulative-cold block is released only by a deliberate RECORDED act
-- (who + when), never an env var someone flips and forgets. Each release raises
-- the authorized cumulative ceiling for a gate; the guard reads the max.
CREATE TABLE IF NOT EXISTS public.outbound_ramp_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gate TEXT NOT NULL,               -- e.g. 'cold_cumulative'
  authorized_ceiling INTEGER NOT NULL,
  released_by TEXT NOT NULL,
  note TEXT,
  released_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outbound_ramp_gates_gate_idx
  ON public.outbound_ramp_gates (gate, released_at DESC);

ALTER TABLE public.outbound_ramp_gates ENABLE ROW LEVEL SECURITY;
-- Service role only.

-- ============================================================
-- blocklist_checks: periodic poll of the sending IP against the major lists
-- ============================================================
-- Complaints are mostly unobservable for our profile, so blocklist listing is a
-- reputation signal we CAN poll. 9c records results here; the halt evaluation
-- reads them (a current listing raises a halt). No alerting — just the record.
CREATE TABLE IF NOT EXISTS public.blocklist_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip TEXT NOT NULL,
  list TEXT NOT NULL,               -- 'spamhaus_zen', 'barracuda', 'spamcop', 'uceprotect1'
  listed BOOLEAN NOT NULL,
  detail TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS blocklist_checks_ip_time_idx
  ON public.blocklist_checks (ip, checked_at DESC);
CREATE INDEX IF NOT EXISTS blocklist_checks_listed_idx
  ON public.blocklist_checks (checked_at DESC)
  WHERE listed = true;

ALTER TABLE public.blocklist_checks ENABLE ROW LEVEL SECURITY;
-- Service role only.

-- ============================================================
-- demo_health_checks: the demo URL is up TODAY before we mail a link to it
-- ============================================================
-- Cold/warm touch 2 is the demo link and nothing else. If the demo is down we
-- send people to a dead page; they don't reply, it reads as disinterest, and it
-- surfaces weeks later as a reply-rate HOLD blamed on copy or list. The guard
-- refuses any touch whose body contains the demo URL unless today's check
-- passed. 9c records the GET result here; no retries/alerting/uptime history.
CREATE TABLE IF NOT EXISTS public.demo_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  passed BOOLEAN NOT NULL,
  status_code INTEGER,
  detail TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS demo_health_checks_time_idx
  ON public.demo_health_checks (checked_at DESC);

ALTER TABLE public.demo_health_checks ENABLE ROW LEVEL SECURITY;
-- Service role only.
