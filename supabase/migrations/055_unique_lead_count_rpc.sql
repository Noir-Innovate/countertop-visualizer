-- RPC to count unique leads by phone or email (deduplicates across multiple submissions)
CREATE OR REPLACE FUNCTION get_unique_lead_count(
  p_start_date TIMESTAMPTZ,
  p_material_line_id UUID DEFAULT NULL,
  p_organization_id UUID DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT COUNT(DISTINCT COALESCE(
    NULLIF(TRIM(phone), ''),
    NULLIF(TRIM(email), ''),
    id::text
  ))::BIGINT
  INTO v_count
  FROM leads
  WHERE created_at >= p_start_date
    AND (p_material_line_id IS NULL OR material_line_id = p_material_line_id)
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);

  RETURN COALESCE(v_count, 0);
END;
$$;
