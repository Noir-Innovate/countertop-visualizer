-- Fix reorder_materials: handle materials not in ordered_ids to avoid unique constraint violations
-- Materials not in the reorder list (e.g. orphan DB records) are placed after the reordered set

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

  -- Phase 1: Set ALL materials in the line to temp values to clear conflicts
  UPDATE materials m
  SET "order" = 1000000 + sub.rn
  FROM (
    SELECT id, row_number() OVER (ORDER BY "order" ASC NULLS LAST, created_at, filename) - 1 AS rn
    FROM materials
    WHERE material_line_id = p_material_line_id
  ) sub
  WHERE m.id = sub.id
    AND m.material_line_id = p_material_line_id;

  -- Phase 2: Set ordered_ids to 1..N
  UPDATE materials m
  SET "order" = sub.ord::INTEGER
  FROM (
    SELECT t.id, t.ord
    FROM unnest(p_ordered_ids) WITH ORDINALITY AS t(id, ord)
  ) sub
  WHERE m.id = sub.id
    AND m.material_line_id = p_material_line_id;

  -- Phase 3: Set materials NOT in ordered_ids to N+1, N+2, ... (preserves relative order)
  UPDATE materials m
  SET "order" = v_ids_length + sub.rn
  FROM (
    SELECT id, row_number() OVER (ORDER BY "order", created_at, filename) AS rn
    FROM materials
    WHERE material_line_id = p_material_line_id
      AND id <> ALL(p_ordered_ids)
  ) sub
  WHERE m.id = sub.id
    AND m.material_line_id = p_material_line_id;
END;
$$;
