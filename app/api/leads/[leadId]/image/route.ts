import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLeadImageUrl } from "@/lib/storage";

interface RouteParams {
  params: Promise<{ leadId: string }>;
}

// GET: Returns signed URL for lead image
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { leadId } = await params;

    // Verify user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch lead with organization info
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("organization_id, image_storage_path")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (!lead.image_storage_path) {
      return NextResponse.json(
        { error: "Lead image not found" },
        { status: 404 },
      );
    }

    // Verify user is member of the organization that owns the lead
    if (lead.organization_id) {
      const { data: membership } = await supabase
        .from("organization_members")
        .select("role")
        .eq("profile_id", user.id)
        .eq("organization_id", lead.organization_id)
        .single();

      if (!membership) {
        return NextResponse.json(
          { error: "You don't have access to this lead" },
          { status: 403 },
        );
      }
    }

    // Get signed URL for the image
    const { url, error: urlError } = await getLeadImageUrl(
      lead.image_storage_path,
      3600, // 1 hour expiration
    );

    if (urlError || !url) {
      console.error("Error creating signed URL:", urlError);
      return NextResponse.json(
        { error: urlError || "Failed to generate image URL" },
        { status: 500 },
      );
    }

    return NextResponse.json({ url }, { status: 200 });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
