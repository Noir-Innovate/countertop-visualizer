import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

interface RouteParams {
  params: Promise<{ materialLineId: string }>;
}

// POST: Reorder materials within a material line
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { materialLineId } = await params;
    const body = await request.json();
    const { materialIds } = body;

    if (
      !materialIds ||
      !Array.isArray(materialIds) ||
      materialIds.length === 0
    ) {
      return NextResponse.json(
        { error: "materialIds array is required" },
        { status: 400 },
      );
    }

    // ============================================
    // AUTHENTICATION CHECK
    // ============================================
    // Verify user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ============================================
    // AUTHORIZATION CHECK - Owner/Admin Only
    // ============================================
    // Verify material line exists and get organization
    const { data: materialLine } = await supabase
      .from("material_lines")
      .select("organization_id")
      .eq("id", materialLineId)
      .single();

    if (!materialLine) {
      return NextResponse.json(
        { error: "Material line not found" },
        { status: 404 },
      );
    }

    // Verify user is owner or admin of the organization
    // Only owners and admins can reorder materials
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("profile_id", user.id)
      .eq("organization_id", materialLine.organization_id)
      .single();

    if (
      !membership ||
      (membership.role !== "owner" && membership.role !== "admin")
    ) {
      return NextResponse.json(
        { error: "You must be an owner or admin to reorder materials" },
        { status: 403 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const serviceClient = createSupabaseClient(supabaseUrl, serviceRoleKey);

    // Validate that all material IDs belong to this material line and fetch their data
    const { data: existingMaterials, error: fetchError } = await serviceClient
      .from("materials")
      .select("id, filename, title, description")
      .eq("material_line_id", materialLineId)
      .in("id", materialIds);

    if (fetchError) {
      console.error("Error fetching materials:", fetchError);
      return NextResponse.json(
        { error: fetchError.message || "Failed to validate materials" },
        { status: 500 },
      );
    }

    if (!existingMaterials || existingMaterials.length !== materialIds.length) {
      return NextResponse.json(
        {
          error:
            "Some material IDs do not belong to this material line or do not exist",
        },
        { status: 400 },
      );
    }

    // Create a map of material ID to material data for quick lookup
    const materialMap = new Map(existingMaterials.map((m) => [m.id, m]));

    // Update all materials' order values atomically using batch upsert
    // To avoid unique constraint violations, we use a two-phase update:
    // 1. First, set all orders to negative values (temporary) to free up the space
    // 2. Then, set them to the correct final values (1-indexed)

    // Phase 1: Set all to temporary negative values using batch upsert
    // Include all required fields to satisfy NOT NULL constraints
    const tempUpdates = materialIds.map((materialId: string, index: number) => {
      const material = materialMap.get(materialId);
      if (!material) {
        throw new Error(`Material ${materialId} not found in fetched data`);
      }
      return {
        id: materialId,
        material_line_id: materialLineId,
        filename: material.filename,
        title: material.title,
        description: material.description,
        order: -(index + 1), // Negative temporary order
      };
    });

    const { error: tempError } = await serviceClient
      .from("materials")
      .upsert(tempUpdates, {
        onConflict: "id",
      });

    if (tempError) {
      console.error("Error setting temporary orders:", tempError);
      return NextResponse.json(
        { error: tempError.message || "Failed to update material orders" },
        { status: 500 },
      );
    }

    // Phase 2: Set all to final correct values using batch upsert
    // Include all required fields to satisfy NOT NULL constraints
    const finalUpdates = materialIds.map(
      (materialId: string, index: number) => {
        const material = materialMap.get(materialId);
        if (!material) {
          throw new Error(`Material ${materialId} not found in fetched data`);
        }
        return {
          id: materialId,
          material_line_id: materialLineId,
          filename: material.filename,
          title: material.title,
          description: material.description,
          order: index + 1, // Final 1-indexed order
        };
      },
    );

    const { error: finalError } = await serviceClient
      .from("materials")
      .upsert(finalUpdates, {
        onConflict: "id",
      });

    if (finalError) {
      console.error("Error setting final orders:", finalError);
      return NextResponse.json(
        { error: finalError.message || "Failed to update material orders" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { success: true, message: "Materials reordered successfully" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
