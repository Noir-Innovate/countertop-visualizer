import { createClient } from "@/lib/supabase/client";

export const MATERIAL_CATEGORIES = [
  "Cabinets",
  "Countertops",
  "Backsplash",
  "Flooring",
] as const;

export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

export interface MaterialColor {
  name: string;
  hex: string;
}

export interface V2Material {
  id: string;
  name: string;
  imageUrl: string;
  material_type?: string | null;
  material_category: string;
  price_per_sqft?: number | null;
  filename: string;
  available_colors?: MaterialColor[] | null;
}

export interface MaterialsByCategory {
  category: string;
  materials: V2Material[];
  count: number;
  colors: MaterialColor[];
}

function generateName(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function getMaterialsByCategory(
  supabaseFolder: string,
  category: string,
): Promise<V2Material[]> {
  const supabase = createClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const { data: materialLine } = await supabase
    .from("material_lines")
    .select("id")
    .eq("supabase_folder", supabaseFolder)
    .single();

  if (!materialLine) return [];

  const { data: materials } = await supabase
    .from("materials")
    .select(
      "id, filename, title, material_type, material_category, order, price_per_sqft, available_colors",
    )
    .eq("material_line_id", materialLine.id)
    .eq("material_category", category)
    .order("order", { ascending: true });

  if (!materials || materials.length === 0) return [];

  return materials.map((m) => ({
    id: m.id,
    name: m.title || generateName(m.filename),
    imageUrl: `${supabaseUrl}/storage/v1/object/public/public-assets/${supabaseFolder}/${m.filename}`,
    material_type: m.material_type,
    material_category: m.material_category || "Countertops",
    price_per_sqft: m.price_per_sqft,
    filename: m.filename,
    available_colors: m.available_colors as MaterialColor[] | null,
  }));
}

export async function getAllMaterialsGrouped(
  supabaseFolder: string,
): Promise<MaterialsByCategory[]> {
  const supabase = createClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const { data: materialLine } = await supabase
    .from("material_lines")
    .select("id, category_colors")
    .eq("supabase_folder", supabaseFolder)
    .single();

  if (!materialLine) return [];

  const categoryColorsMap: Record<string, MaterialColor[]> =
    (materialLine.category_colors as Record<string, MaterialColor[]>) || {};

  const { data: materials } = await supabase
    .from("materials")
    .select(
      "id, filename, title, material_type, material_category, order, price_per_sqft, available_colors",
    )
    .eq("material_line_id", materialLine.id)
    .order("order", { ascending: true });

  if (!materials) return [];

  const grouped: Record<string, V2Material[]> = {};

  for (const m of materials) {
    const cat = m.material_category || "Countertops";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({
      id: m.id,
      name: m.title || generateName(m.filename),
      imageUrl: `${supabaseUrl}/storage/v1/object/public/public-assets/${supabaseFolder}/${m.filename}`,
      material_type: m.material_type,
      material_category: cat,
      price_per_sqft: m.price_per_sqft,
      filename: m.filename,
      available_colors: m.available_colors as MaterialColor[] | null,
    });
  }

  return MATERIAL_CATEGORIES.map((cat) => ({
    category: cat,
    materials: grouped[cat] || [],
    count: grouped[cat]?.length || 0,
    colors: categoryColorsMap[cat] || [],
  }));
}
