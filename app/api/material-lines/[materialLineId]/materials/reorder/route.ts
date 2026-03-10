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
    const { materialIds, materialCategory } = body;

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

    const { error: rpcError } = await serviceClient.rpc("reorder_materials", {
      p_material_line_id: materialLineId,
      p_ordered_ids: materialIds,
      p_material_category: materialCategory || null,
    });

    if (rpcError) {
      console.error("Error reordering materials:", rpcError);
      const isValidationError =
        rpcError.message?.includes("do not belong") ||
        rpcError.message?.includes("Duplicate") ||
        rpcError.message?.includes("required");
      return NextResponse.json(
        {
          error: rpcError.message || "Failed to update material orders",
        },
        { status: isValidationError ? 400 : 500 },
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
