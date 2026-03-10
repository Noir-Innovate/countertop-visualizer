-- Update reorder_materials RPC to support per-category ordering
-- Adds optional p_material_category parameter (NULL = legacy behavior across all categories)

DROP FUNCTION IF EXISTS reorder_materials(UUID, UUID[]);

CREATE OR REPLACE FUNCTION reorder_materials(
  p_material_line_id UUID,
  p_ordered_ids UUID[],
  p_material_category TEXT DEFAULT NULL
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
  v_ids_length := array_length(p_ordered_ids, 1);
  IF v_ids_length IS NULL OR v_ids_length = 0 THEN
    RAISE EXCEPTION 'ordered_ids array is required and must not be empty';
  END IF;

  SELECT count(DISTINCT id) INTO v_distinct_count
  FROM unnest(p_ordered_ids) AS id;
  IF v_distinct_count != v_ids_length THEN
    RAISE EXCEPTION 'Duplicate material IDs in ordered list';
  END IF;

  SELECT count(*) INTO v_valid_count
  FROM materials
  WHERE id = ANY(p_ordered_ids)
    AND material_line_id = p_material_line_id;
  IF v_valid_count != v_ids_length THEN
    RAISE EXCEPTION 'Some material IDs do not belong to this material line or do not exist';
  END IF;

  -- Phase 1: Temp values for all materials in scope (category-scoped or all)
  IF p_material_category IS NOT NULL THEN
    UPDATE materials m
    SET "order" = 1000000 + sub.rn
    FROM (
      SELECT id, row_number() OVER (ORDER BY "order" ASC NULLS LAST, created_at, filename) - 1 AS rn
      FROM materials
      WHERE material_line_id = p_material_line_id
        AND material_category = p_material_category
    ) sub
    WHERE m.id = sub.id
      AND m.material_line_id = p_material_line_id;
  ELSE
    UPDATE materials m
    SET "order" = 1000000 + sub.rn
    FROM (
      SELECT id, row_number() OVER (ORDER BY "order" ASC NULLS LAST, created_at, filename) - 1 AS rn
      FROM materials
      WHERE material_line_id = p_material_line_id
    ) sub
    WHERE m.id = sub.id
      AND m.material_line_id = p_material_line_id;
  END IF;

  -- Phase 2: Ordered IDs get 1..N
  UPDATE materials m
  SET "order" = sub.ord::INTEGER
  FROM (
    SELECT t.id, t.ord
    FROM unnest(p_ordered_ids) WITH ORDINALITY AS t(id, ord)
  ) sub
  WHERE m.id = sub.id
    AND m.material_line_id = p_material_line_id;

  -- Phase 3: Remaining materials in scope get N+1, N+2, ...
  IF p_material_category IS NOT NULL THEN
    UPDATE materials m
    SET "order" = v_ids_length + sub.rn
    FROM (
      SELECT id, row_number() OVER (ORDER BY "order", created_at, filename) AS rn
      FROM materials
      WHERE material_line_id = p_material_line_id
        AND material_category = p_material_category
        AND id <> ALL(p_ordered_ids)
    ) sub
    WHERE m.id = sub.id
      AND m.material_line_id = p_material_line_id;
  ELSE
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
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION reorder_materials(UUID, UUID[], TEXT) TO service_role;

COMMENT ON FUNCTION reorder_materials(UUID, UUID[], TEXT) IS
  'Atomically reorder materials within a material line, optionally scoped to a category.';
