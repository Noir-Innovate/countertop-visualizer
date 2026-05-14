import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadMaterialInventory } from "@/lib/v2/material-inventory";

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

type FakeOptions = {
  line: MaterialLineRow | null;
  lineError?: { message: string } | null;
  materials: MaterialRow[];
  materialsError?: { message: string } | null;
  onMaterialsQuery?: (args: {
    materialLineId: string;
    ascending: boolean;
  }) => void;
};

/**
 * A hand-rolled fake exposing only `supabase.from(...)`. Mirrors the chains the
 * helper builds:
 *   from('material_lines').select(...).eq('id', id).single()
 *   from('materials').select(...).eq('material_line_id', id).order('order', { ascending: true })
 */
function makeFakeSupabase(opts: FakeOptions): Pick<SupabaseClient, "from"> {
  return {
    from: (table: string) => {
      if (table === "material_lines") {
        return {
          select: () => ({
            eq: (_col: string, _val: string) => ({
              single: async <T,>() => ({
                data: opts.line as unknown as T,
                error: opts.lineError ?? null,
              }),
            }),
          }),
        } as never;
      }
      if (table === "materials") {
        let captured: { materialLineId: string; ascending: boolean } = {
          materialLineId: "",
          ascending: true,
        };
        return {
          select: () => ({
            eq: (_col: string, val: string) => {
              captured.materialLineId = val;
              return {
                order: (_col: string, ord: { ascending: boolean }) => {
                  captured.ascending = ord.ascending;
                  opts.onMaterialsQuery?.(captured);
                  return {
                    returns: async <T,>() => ({
                      data: opts.materials as unknown as T,
                      error: opts.materialsError ?? null,
                    }),
                  };
                },
              };
            },
          }),
        } as never;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const LINE: MaterialLineRow = {
  name: "Acme Quartz",
  supabase_folder: "acme/quartz",
  category_colors: { Cabinets: [{ name: "White", hex: "#fff" }] },
};

test("loadMaterialInventory returns all materials from the DB ordered by `order`", async () => {
  const materials: MaterialRow[] = Array.from({ length: 125 }, (_, i) => ({
    id: `m${i + 1}`,
    filename: `slab-${String(i + 1).padStart(3, "0")}.jpg`,
    title: `Slab ${i + 1}`,
    material_type: "Quartz",
    material_category: "Countertops",
    order: i + 1,
    price_per_sqft: 49.99,
    available_colors: null,
  }));

  const supabase = makeFakeSupabase({ line: LINE, materials });
  const result = await loadMaterialInventory(supabase, "ml-1");

  assert.ok(result);
  assert.equal(
    result.materials.length,
    125,
    "must return all 125 rows — no storage-list cap leaking in",
  );
  assert.equal(result.materials[0].name, "slab-001.jpg");
  assert.equal(result.materials[124].name, "slab-125.jpg");
  assert.equal(result.materialLine.name, "Acme Quartz");
  assert.equal(result.materialLine.supabase_folder, "acme/quartz");
});

test("loadMaterialInventory queries by material_line_id and asks for ascending order", async () => {
  let observed: { materialLineId: string; ascending: boolean } | null = null;
  const supabase = makeFakeSupabase({
    line: LINE,
    materials: [],
    onMaterialsQuery: (args) => {
      observed = args;
    },
  });

  await loadMaterialInventory(supabase, "ml-target");

  assert.deepEqual(observed, { materialLineId: "ml-target", ascending: true });
});

test("loadMaterialInventory returns null when the material line is missing", async () => {
  const supabase = makeFakeSupabase({
    line: null,
    lineError: { message: "no rows" },
    materials: [],
  });
  const result = await loadMaterialInventory(supabase, "missing");
  assert.equal(result, null);
});

test("loadMaterialInventory throws when the materials query errors", async () => {
  const supabase = makeFakeSupabase({
    line: LINE,
    materials: [],
    materialsError: { message: "boom" },
  });
  await assert.rejects(
    () => loadMaterialInventory(supabase, "ml-1"),
    (err: unknown) =>
      typeof err === "object" &&
      err !== null &&
      "message" in err &&
      (err as { message: string }).message === "boom",
  );
});

test("loadMaterialInventory fills defaults for null/missing fields without dropping rows", async () => {
  const supabase = makeFakeSupabase({
    line: LINE,
    materials: [
      {
        id: "m1",
        filename: "no-category.jpg",
        title: null,
        material_type: null,
        material_category: null,
        order: null,
        price_per_sqft: null,
        available_colors: null,
      },
    ],
  });

  const result = await loadMaterialInventory(supabase, "ml-1");
  assert.ok(result);
  assert.equal(result.materials.length, 1);
  const m = result.materials[0];
  assert.equal(m.material_category, "Countertops", "defaults to Countertops");
  assert.equal(m.order, 999999, "null order sorts to the end");
  assert.equal(m.title, null);
  assert.equal(m.material_type, null);
  assert.equal(m.price_per_sqft, null);
  assert.equal(m.available_colors, null);
});

test("loadMaterialInventory returns an empty list (not null) for a line with zero materials", async () => {
  const supabase = makeFakeSupabase({ line: LINE, materials: [] });
  const result = await loadMaterialInventory(supabase, "ml-1");
  assert.ok(result);
  assert.equal(result.materials.length, 0);
  assert.equal(result.materialLine.name, "Acme Quartz");
});

test("loadMaterialInventory exposes category_colors verbatim", async () => {
  const supabase = makeFakeSupabase({
    line: {
      ...LINE,
      category_colors: {
        Cabinets: [
          { name: "Ivory", hex: "#fffdf6" },
          { name: "Charcoal", hex: "#333" },
        ],
      },
    },
    materials: [],
  });
  const result = await loadMaterialInventory(supabase, "ml-1");
  assert.ok(result);
  assert.deepEqual(result.materialLine.category_colors, {
    Cabinets: [
      { name: "Ivory", hex: "#fffdf6" },
      { name: "Charcoal", hex: "#333" },
    ],
  });
});

test("loadMaterialInventory ignores storage entirely (no .storage access)", async () => {
  // The fake intentionally does not implement `.storage`. If the helper ever
  // touches storage, this throws and the test fails — guarding the architectural
  // invariant that the inventory is DB-only.
  const supabase = makeFakeSupabase({
    line: LINE,
    materials: [
      {
        id: "m1",
        filename: "only-in-db.jpg",
        title: "Only In DB",
        material_type: "Granite",
        material_category: "Countertops",
        order: 1,
        price_per_sqft: 60,
        available_colors: null,
      },
    ],
  });

  const result = await loadMaterialInventory(supabase, "ml-1");
  assert.ok(result);
  assert.equal(result.materials.length, 1);
  assert.equal(result.materials[0].name, "only-in-db.jpg");
});
