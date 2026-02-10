import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

interface RouteParams {
  params: Promise<{ materialLineId: string; linkId: string }>;
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role config");
  return createSupabaseClient(url, key);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { materialLineId, linkId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("profile_id", user.id)
      .eq("organization_id", materialLine.organization_id)
      .single();
    if (!membership) {
      return NextResponse.json(
        { error: "You don't have access to this material line" },
        { status: 403 },
      );
    }

    const serviceClient = getServiceClient();
    const { error } = await serviceClient
      .from("tracking_links")
      .delete()
      .eq("id", linkId)
      .eq("material_line_id", materialLineId);

    if (error) {
      console.error("tracking_links DELETE error:", error);
      return NextResponse.json(
        { error: "Failed to delete tracking link" },
        { status: 500 },
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("tracking_links DELETE:", err);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}
