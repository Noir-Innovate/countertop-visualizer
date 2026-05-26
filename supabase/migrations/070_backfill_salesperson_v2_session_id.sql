-- Backfill v2_session_id for salesperson-created leads that pre-date the
-- column being populated at insert time. Without this, generations made for
-- those early jobs are orphaned: lead.v2_session_id IS NULL but the generations
-- carry whatever client-side fallback session id was active at the time.
-- New rows are not affected; POST /api/sales/jobs already mints one.
UPDATE leads
SET v2_session_id = gen_random_uuid()::text
WHERE source = 'salesperson'
  AND v2_session_id IS NULL;
