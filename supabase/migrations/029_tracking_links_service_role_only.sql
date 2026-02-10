-- Restrict tracking_links to service role only
-- All read/write access goes through API endpoints (which use service role after verifying auth)

DROP POLICY IF EXISTS "Org members can view tracking_links" ON tracking_links;
DROP POLICY IF EXISTS "Org members can insert tracking_links" ON tracking_links;
DROP POLICY IF EXISTS "Org members can update tracking_links" ON tracking_links;
DROP POLICY IF EXISTS "Org members can delete tracking_links" ON tracking_links;
