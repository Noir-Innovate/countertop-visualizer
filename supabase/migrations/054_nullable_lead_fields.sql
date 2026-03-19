-- Allow minimal leads (phone + image only) for download/share flow.
-- Field requirements are enforced in the UI per flow.
ALTER TABLE leads ALTER COLUMN name DROP NOT NULL;
ALTER TABLE leads ALTER COLUMN email DROP NOT NULL;
ALTER TABLE leads ALTER COLUMN address DROP NOT NULL;
