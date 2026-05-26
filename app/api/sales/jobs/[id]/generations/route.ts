import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Confirm ownership and pull the session id off the lead.
  const { data: lead } = await supabase
    .from("leads")
    .select("id, salesperson_id, v2_session_id")
    .eq("id", id)
    .maybeSingle();
  if (!lead || lead.salesperson_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!lead.v2_session_id) {
    return NextResponse.json({ generations: [] });
  }

  const service = await createServiceClient();
  const { data: rows, error } = await service
    .from("generated_images")
    .select(
      `
      id,
      session_id,
      material_id,
      material_category,
      kitchen_image_path,
      output_image_path,
      generation_order,
      created_at,
      materials(title)
      `,
    )
    .eq("session_id", lead.v2_session_id)
    .order("generation_order", { ascending: true });

  if (error) {
    console.error("[sales/jobs/generations] failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const publicUrl = (path: string | null | undefined) =>
    path ? `${supabaseUrl}/storage/v1/object/public/public-assets/${path}` : null;

  type Row = {
    id: string;
    material_id: string | null;
    material_category: string;
    kitchen_image_path: string;
    output_image_path: string;
    generation_order: number;
    created_at: string;
    materials: { title: string | null } | { title: string | null }[] | null;
  };

  const generations = ((rows || []) as Row[]).map((r) => {
    const mat = Array.isArray(r.materials) ? r.materials[0] : r.materials;
    return {
      id: r.id,
      materialId: r.material_id,
      materialName: mat?.title || null,
      materialCategory: r.material_category,
      kitchenImageUrl: publicUrl(r.kitchen_image_path),
      outputImageUrl: publicUrl(r.output_image_path),
      generationOrder: r.generation_order,
      createdAt: r.created_at,
    };
  });

  return NextResponse.json({ generations });
}
