-- Add an access lock to material lines.
-- When TRUE on an internal line, the public visualizer is no longer reachable
-- directly: visitors are forwarded to the authenticated /sales portal, which
-- enforces login + line-assignment (or admin) access. Only meaningful for
-- internal lines; external lines ignore it.

ALTER TABLE material_lines
  ADD COLUMN IF NOT EXISTS access_locked BOOLEAN NOT NULL DEFAULT FALSE;
