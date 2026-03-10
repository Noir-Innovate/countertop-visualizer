-- Rename "Walls" category to "Backsplash" in materials
UPDATE materials SET material_category = 'Backsplash'
  WHERE material_category = 'Walls';

-- Rename "Walls" key to "Backsplash" in category_colors JSONB on material_lines
UPDATE material_lines
  SET category_colors = (category_colors - 'Walls') || jsonb_build_object('Backsplash', category_colors->'Walls')
  WHERE category_colors ? 'Walls';
