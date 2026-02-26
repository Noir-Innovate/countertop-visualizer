-- Allow material line kind updates (for super user workflows)
DROP TRIGGER IF EXISTS material_lines_kind_immutable_trigger ON material_lines;
DROP FUNCTION IF EXISTS prevent_material_line_kind_update();
