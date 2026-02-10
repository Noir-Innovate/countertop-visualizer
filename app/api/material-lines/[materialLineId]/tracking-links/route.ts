import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

interface RouteParams {
  params: Promise<{ materialLineId: string }>;
}

async function verifyAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  materialLineId: string,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized", status: 401 as const };
  }
  const { data: materialLine } = await supabase
    .from("material_lines")
    .select("organization_id")
    .eq("id", materialLineId)
    .single();
  if (!materialLine) {
    return { error: "Material line not found", status: 404 as const };
  }
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", materialLine.organization_id)
    .single();
  if (!membership) {
    return {
      error: "You don't have access to this material line",
      status: 403 as const,
    };
  }
  return { user, materialLine };
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role config");
  return createSupabaseClient(url, key);
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { materialLineId } = await params;
    const supabase = await createClient();
    const access = await verifyAccess(supabase, materialLineId);
    if ("error" in access) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      );
    }

    const serviceClient = getServiceClient();
    const { data: links, error } = await serviceClient
      .from("tracking_links")
      .select(
        "id, name, utm_source, utm_medium, utm_campaign, utm_term, utm_content, tags, created_at",
      )
      .eq("material_line_id", materialLineId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("tracking_links GET error:", error);
      return NextResponse.json(
        { error: "Failed to load tracking links" },
        { status: 500 },
      );
    }
    return NextResponse.json(links ?? []);
  } catch (err) {
    console.error("tracking_links GET:", err);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { materialLineId } = await params;
    const supabase = await createClient();
    const access = await verifyAccess(supabase, materialLineId);
    if ("error" in access) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      );
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const tags =
      body.tags && typeof body.tags === "object" && !Array.isArray(body.tags)
        ? body.tags
        : {};

    const serviceClient = getServiceClient();
    const { data: link, error } = await serviceClient
      .from("tracking_links")
      .insert({
        material_line_id: materialLineId,
        name,
        utm_source: body.utm_source?.trim() || null,
        utm_medium: body.utm_medium?.trim() || null,
        utm_campaign: body.utm_campaign?.trim() || null,
        utm_term: body.utm_term?.trim() || null,
        utm_content: body.utm_content?.trim() || null,
        tags: Object.keys(tags).length > 0 ? tags : {},
        created_by: access.user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("tracking_links POST error:", error);
      return NextResponse.json(
        { error: "Failed to save tracking link" },
        { status: 500 },
      );
    }
    return NextResponse.json(link);
  } catch (err) {
    console.error("tracking_links POST:", err);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}
