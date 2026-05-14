import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  countMaterialsForLine,
  loadMaterialInventory,
} from "@/lib/v2/material-inventory";

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
  line?: MaterialLineRow | null;
  lineError?: { message: string } | null;
  materials?: MaterialRow[];
  /** Overrides the count returned by head+count queries. Defaults to materials.length. */
  materialCount?: number;
  materialsError?: { message: string } | null;
  onMaterialsQuery?: (args: {
    materialLineId: string;
    ascending: boolean;
  }) => void;
  onCountQuery?: (args: { materialLineId: string; head: boolean }) => void;
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
        const rows = opts.materials ?? [];
        const count = opts.materialCount ?? rows.length;
        return {
          select: (_cols: string, selectOpts?: { count?: string; head?: boolean }) => {
            const isCountQuery = selectOpts?.count === "exact";
            return {
              eq: (_col: string, val: string) => {
                if (isCountQuery) {
                  opts.onCountQuery?.({
                    materialLineId: val,
                    head: !!selectOpts?.head,
                  });
                  // head+count: terminal, awaited directly.
                  return Promise.resolve({
                    count,
                    data: null,
                    error: opts.materialsError ?? null,
                  });
                }
                return {
                  order: (_col: string, ord: { ascending: boolean }) => {
                    opts.onMaterialsQuery?.({
                      materialLineId: val,
                      ascending: ord.ascending,
                    });
                    return {
                      returns: async <T,>() => ({
                        data: rows as unknown as T,
                        error: opts.materialsError ?? null,
                      }),
                    };
                  },
                };
              },
            };
          },
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

// ---------------------------------------------------------------------------
// Regression tests for the original "100 cap" bug. Both the slabs page (uses
// loadMaterialInventory) and the material-line overview page (uses
// countMaterialsForLine) must show every material when a line has more than
// 100 — that was the customer report. These tests intentionally use sizes well
// above 100 so a future regression to storage.list() (default cap 100) or any
// other accidental limit fails loudly.
// ---------------------------------------------------------------------------

function makeMaterialRows(n: number): MaterialRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `m${i + 1}`,
    filename: `slab-${String(i + 1).padStart(4, "0")}.jpg`,
    title: `Slab ${i + 1}`,
    material_type: "Quartz",
    material_category: "Countertops",
    order: i + 1,
    price_per_sqft: 49.99,
    available_colors: null,
  }));
}

test("regression: loadMaterialInventory returns all rows when count > 100 (101 rows)", async () => {
  const materials = makeMaterialRows(101);
  const supabase = makeFakeSupabase({ line: LINE, materials });
  const result = await loadMaterialInventory(supabase, "ml-1");
  assert.ok(result);
  assert.equal(result.materials.length, 101);
  assert.equal(result.materials[100].name, "slab-0101.jpg");
});

test("regression: loadMaterialInventory returns all rows for the reported size (125 rows)", async () => {
  // This is the size the customer reported: folder has 125 images, dashboard
  // was showing 99. Helper must return all 125.
  const materials = makeMaterialRows(125);
  const supabase = makeFakeSupabase({ line: LINE, materials });
  const result = await loadMaterialInventory(supabase, "ml-1");
  assert.ok(result);
  assert.equal(result.materials.length, 125);
});

test("regression: loadMaterialInventory handles >>100 rows (500) without truncation", async () => {
  const materials = makeMaterialRows(500);
  const supabase = makeFakeSupabase({ line: LINE, materials });
  const result = await loadMaterialInventory(supabase, "ml-1");
  assert.ok(result);
  assert.equal(result.materials.length, 500);
  assert.equal(result.materials[0].name, "slab-0001.jpg");
  assert.equal(result.materials[499].name, "slab-0500.jpg");
});

test("regression: countMaterialsForLine reports >100 (returns 125)", async () => {
  // The material-line overview page uses this helper. Before the fix it
  // called storage.list() and returned 99 for a 125-image folder.
  const supabase = makeFakeSupabase({ materialCount: 125 });
  const count = await countMaterialsForLine(supabase, "ml-1");
  assert.equal(count, 125);
});

test("regression: countMaterialsForLine handles boundary (101) and large (5000) counts", async () => {
  for (const expected of [101, 250, 5000]) {
    const supabase = makeFakeSupabase({ materialCount: expected });
    const count = await countMaterialsForLine(supabase, "ml-1");
    assert.equal(count, expected, `count should equal ${expected}`);
  }
});

test("countMaterialsForLine queries materials by material_line_id using head+count", async () => {
  let observed: { materialLineId: string; head: boolean } | null = null;
  const supabase = makeFakeSupabase({
    materialCount: 42,
    onCountQuery: (args) => {
      observed = args;
    },
  });
  await countMaterialsForLine(supabase, "ml-xyz");
  assert.deepEqual(observed, { materialLineId: "ml-xyz", head: true });
});

test("countMaterialsForLine returns 0 when the table is empty", async () => {
  const supabase = makeFakeSupabase({ materialCount: 0 });
  const count = await countMaterialsForLine(supabase, "ml-1");
  assert.equal(count, 0);
});

test("countMaterialsForLine surfaces query errors", async () => {
  const supabase = makeFakeSupabase({
    materialCount: 0,
    materialsError: { message: "rls denied" },
  });
  await assert.rejects(
    () => countMaterialsForLine(supabase, "ml-1"),
    (err: unknown) =>
      typeof err === "object" &&
      err !== null &&
      "message" in err &&
      (err as { message: string }).message === "rls denied",
  );
});
