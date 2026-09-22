-- Packet OD — seed the internal_tasks board with one row per build chunk, so the
-- PM (countertop-pm) can track OD-1..OD-6 by stable id. Idempotent
-- (ON CONFLICT DO NOTHING) and guarded on internal_tasks existing, so it is safe
-- to apply before/after 073_internal_tasks.sql and safe to re-run.
--
-- ids are fixed (minted for this packet) so they can be referenced in
-- coordination messages before the rows physically exist in prod.
DO $$
BEGIN
  IF to_regclass('public.internal_tasks') IS NULL THEN
    RAISE NOTICE 'internal_tasks not present yet; skipping OD task seed (re-run after 073)';
    RETURN;
  END IF;

  INSERT INTO public.internal_tasks
    (id, kind, status, priority, title, description, assigned_to, source_url)
  VALUES
    ('571a5361-a8ef-4e92-a2d1-0f4b092feda1', 'feature', 'open', 'high',
     'OD-1 prospects table',
     'Org+campaign-scoped prospects table with mandatory provenance (source_url, sourced_at NOT NULL) and case-insensitive unique email. Migration 074.',
     'countertop-visualizer', 'packet-od-outbound-data-layer-critical-path'),
    ('38ac1193-932e-4b87-ac13-434159ec02d2', 'feature', 'open', 'urgent',
     'OD-2 suppression table + shared send guard',
     'Global permanent suppression table + one shared guard (lib/email-suppression.ts) enforced in sendEmail; bypass test catches any new send path skipping it. Migration 074.',
     'countertop-visualizer', 'packet-od-outbound-data-layer-critical-path'),
    ('a39ef1ca-19d4-46df-936f-1133091df709', 'feature', 'open', 'high',
     'OD-3 CSV import',
     'Import prospects from CSV: dedupe vs prospects + suppression, reject rows with no provenance, per-row outcome report, idempotent.',
     'countertop-visualizer', 'packet-od-outbound-data-layer-critical-path'),
    ('d6e3910f-8f47-4b5c-a019-539d7c48fb5a', 'feature', 'open', 'normal',
     'OD-4 campaign / sequence tracking',
     'Per-prospect touches/replies/bounces/complaints/unsubscribes. Hard bounces + complaints auto-write suppression. No open tracking, no pixel, no link wrapping.',
     'countertop-visualizer', 'packet-od-outbound-data-layer-critical-path'),
    ('de9c0f2e-521f-44cd-afc3-0f269d8527b6', 'feature', 'open', 'high',
     'OD-5 one-click unsubscribe endpoint',
     'RFC 8058 POST-confirmed List-Unsubscribe backing. Writes suppression immediately, idempotent, no auth, scanner/prefetch-safe (no bare GET side effect).',
     'countertop-visualizer', 'packet-od-outbound-data-layer-critical-path'),
    ('ccdaeaa0-ba20-4747-9715-499bfa00027e', 'feature', 'open', 'normal',
     'OD-6 /admin surfaces',
     'super_admin-gated admin views: prospects, suppression (searchable + manual add), import outcomes, campaign stats. Consistent with /admin/tasks.',
     'countertop-visualizer', 'packet-od-outbound-data-layer-critical-path')
  ON CONFLICT (id) DO NOTHING;
END $$;
