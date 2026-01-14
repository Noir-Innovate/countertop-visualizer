import { NextRequest, NextResponse } from "next/server";
import { uploadLeadImage } from "@/lib/storage";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, organizationId, materialLineId } =
      await request.json();

    if (!imageBase64) {
      return NextResponse.json(
        { error: "Image data is required" },
        { status: 400 }
      );
    }

    // Get organization and material line slugs
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let orgSlug = "default";
    let materialLineSlug = "default";

    if (organizationId && organizationId !== "default") {
      const { data: org } = await supabase
        .from("organizations")
        .select("slug")
        .eq("id", organizationId)
        .single();
      if (org?.slug) {
        orgSlug = org.slug;
      }
    }

    if (materialLineId && materialLineId !== "default") {
      const { data: materialLine } = await supabase
        .from("material_lines")
        .select("slug")
        .eq("id", materialLineId)
        .single();
      if (materialLine?.slug) {
        materialLineSlug = materialLine.slug;
      }
    }

    // Parse base64 to get MIME type
    const mimeMatch = imageBase64.match(/data:image\/(\w+);base64/);
    const mimeType = mimeMatch ? `image/${mimeMatch[1]}` : "image/jpeg";

    // Upload image
    const uploadResult = await uploadLeadImage(
      orgSlug,
      materialLineSlug,
      imageBase64,
      mimeType
    );

    if (uploadResult.error || !uploadResult.path || !uploadResult.url) {
      return NextResponse.json(
        { error: uploadResult.error || "Failed to upload image" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      storagePath: uploadResult.path,
      signedUrl: uploadResult.url,
    });
  } catch (error) {
    console.error("Upload lead image error:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}
