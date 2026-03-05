-- Reorder Materials RPC
-- Atomic two-phase reorder using collision-free temp values to avoid unique constraint violations

CREATE OR REPLACE FUNCTION reorder_materials(
  p_material_line_id UUID,
  p_ordered_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid_count INTEGER;
  v_ids_length INTEGER;
  v_distinct_count INTEGER;
BEGIN
  -- Validate: no empty array
  v_ids_length := array_length(p_ordered_ids, 1);
  IF v_ids_length IS NULL OR v_ids_length = 0 THEN
    RAISE EXCEPTION 'ordered_ids array is required and must not be empty';
  END IF;

  -- Validate: no duplicate IDs in the array
  SELECT count(DISTINCT id) INTO v_distinct_count
  FROM unnest(p_ordered_ids) AS id;
  IF v_distinct_count != v_ids_length THEN
    RAISE EXCEPTION 'Duplicate material IDs in ordered list';
  END IF;

  -- Validate: all IDs exist in materials and belong to this material line
  SELECT count(*) INTO v_valid_count
  FROM materials
  WHERE id = ANY(p_ordered_ids)
    AND material_line_id = p_material_line_id;
  IF v_valid_count != v_ids_length THEN
    RAISE EXCEPTION 'Some material IDs do not belong to this material line or do not exist';
  END IF;

  -- Atomic two-phase update within a single transaction (implicit in plpgsql)
  -- Phase 1: Set temp orders (1_000_000 + index) to avoid collision with existing 1..N or -1..-N
  UPDATE materials m
  SET "order" = 1000000 + sub.ord - 1
  FROM (
    SELECT t.id, t.ord
    FROM unnest(p_ordered_ids) WITH ORDINALITY AS t(id, ord)
  ) sub
  WHERE m.id = sub.id
    AND m.material_line_id = p_material_line_id;

  -- Phase 2: Set final 1-indexed orders
  UPDATE materials m
  SET "order" = sub.ord::INTEGER
  FROM (
    SELECT t.id, t.ord
    FROM unnest(p_ordered_ids) WITH ORDINALITY AS t(id, ord)
  ) sub
  WHERE m.id = sub.id
    AND m.material_line_id = p_material_line_id;
END;
$$;

-- Allow service_role to execute (used by API route)
GRANT EXECUTE ON FUNCTION reorder_materials(UUID, UUID[]) TO service_role;

COMMENT ON FUNCTION reorder_materials(UUID, UUID[]) IS
  'Atomically reorder materials within a material line. Uses two-phase update with collision-free temp values to avoid unique_material_line_order constraint violations.';
