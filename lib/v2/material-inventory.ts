import type { SupabaseClient } from "@supabase/supabase-js";

export interface MaterialColor {
  name: string;
  hex: string;
}

export interface InventoryMaterial {
  id: string;
  name: string;
  title: string | null;
  material_type: string | null;
  material_category: string;
  order: number;
  price_per_sqft: number | null;
  available_colors: MaterialColor[] | null;
}

export interface MaterialLineSummary {
  name: string;
  supabase_folder: string;
  category_colors: Record<string, MaterialColor[]> | null;
}

export interface MaterialInventory {
  materialLine: MaterialLineSummary;
  materials: InventoryMaterial[];
}

type MaterialRow = {
  id: string;
  filename: string;
  title: string | null;
  material_type: string | null;
  material_category: string | null;
  order: number | null;
  price_per_sqft: number | null;
  available_colors: unknown;
};

type MaterialLineRow = {
  name: string;
  supabase_folder: string;
  category_colors: unknown;
};

const DEFAULT_CATEGORY = "Countertops";
const TRAILING_ORDER = 999999;

/**
 * Loads a material line and its materials from the DB. Storage is intentionally
 * not consulted: the public visualizer is DB-driven, so the dashboard must be
 * too — otherwise the displayed count can drift from what customers see.
 */
export async function loadMaterialInventory(
  supabase: Pick<SupabaseClient, "from">,
  materialLineId: string,
): Promise<MaterialInventory | null> {
  const { data: mlData, error: mlError } = await supabase
    .from("material_lines")
    .select("name, supabase_folder, category_colors")
    .eq("id", materialLineId)
    .single<MaterialLineRow>();

  if (mlError || !mlData) return null;

  const { data: materialsData, error: matError } = await supabase
    .from("materials")
    .select(
      "id, filename, title, material_type, material_category, order, price_per_sqft, available_colors",
    )
    .eq("material_line_id", materialLineId)
    .order("order", { ascending: true })
    .returns<MaterialRow[]>();

  if (matError) {
    throw matError;
  }

  const materials = (materialsData ?? []).map(toInventoryMaterial);

  return {
    materialLine: {
      name: mlData.name,
      supabase_folder: mlData.supabase_folder,
      category_colors:
        (mlData.category_colors as Record<string, MaterialColor[]> | null) ??
        null,
    },
    materials,
  };
}

/**
 * Returns the exact number of `materials` rows for a line. Uses PostgREST's
 * head+count so no rows are transferred — needed because storage.list() caps
 * at 100 and drops non-image entries.
 */
export async function countMaterialsForLine(
  supabase: Pick<SupabaseClient, "from">,
  materialLineId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("materials")
    .select("*", { count: "exact", head: true })
    .eq("material_line_id", materialLineId);
  if (error) throw error;
  return count ?? 0;
}

export function toInventoryMaterial(row: MaterialRow): InventoryMaterial {
  return {
    id: row.id,
    name: row.filename,
    title: row.title,
    material_type: row.material_type,
    material_category: row.material_category || DEFAULT_CATEGORY,
    order: row.order ?? TRAILING_ORDER,
    price_per_sqft: row.price_per_sqft,
    available_colors: (row.available_colors as MaterialColor[] | null) ?? null,
  };
}
