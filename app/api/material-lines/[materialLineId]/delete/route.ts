import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { getOrgAccess } from "@/lib/admin-auth";

interface RouteParams {
  params: Promise<{ materialLineId: string }>;
}

const DELETE_ROLES = new Set(["owner", "admin", "super_admin"]);

async function collectFilePaths(
  serviceClient: SupabaseClient,
  prefix: string,
  paths: string[],
): Promise<void> {
  const { data: items } = await serviceClient.storage
    .from("public-assets")
    .list(prefix, { limit: 500 });

  if (!items?.length) return;

  for (const item of items) {
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
    const hasImageExtension = /\.(jpg|jpeg|png|webp|gif|tif|tiff)$/i.test(
      item.name,
    );
    if (!hasImageExtension && (item.id == null || item.metadata == null)) {
      await collectFilePaths(serviceClient, fullPath, paths);
    } else {
      paths.push(fullPath);
    }
  }
}

const REMOVE_BATCH = 100;

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { materialLineId } = await params;

    let body: { confirmationName?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const confirmationName =
      typeof body.confirmationName === "string" ? body.confirmationName : "";

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: materialLine, error: lineError } = await supabase
      .from("material_lines")
      .select("id, name, organization_id, supabase_folder")
      .eq("id", materialLineId)
      .single();

    if (lineError || !materialLine) {
      return NextResponse.json(
        { error: "Material line not found" },
        { status: 404 },
      );
    }

    if (confirmationName.trim() !== (materialLine.name as string).trim()) {
      return NextResponse.json(
        {
          error:
            "The name you entered does not match this material line. Type the internal name exactly.",
        },
        { status: 400 },
      );
    }

    const orgId = materialLine.organization_id as string;
    const access = await getOrgAccess(orgId);

    if (
      !access?.allowed ||
      !DELETE_ROLES.has(access.role)
    ) {
      return NextResponse.json(
        {
          error:
            "You must be an owner or admin of this organization to delete a material line.",
        },
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
    const folder = (materialLine.supabase_folder as string) || "";

    const { error: deleteError } = await serviceClient
      .from("material_lines")
      .delete()
      .eq("id", materialLineId);

    if (deleteError) {
      console.error("Delete material line error:", deleteError);
      return NextResponse.json(
        { error: deleteError.message ?? "Failed to delete material line" },
        { status: 500 },
      );
    }

    if (folder) {
      const filePaths: string[] = [];
      await collectFilePaths(serviceClient, folder, filePaths);

      for (let i = 0; i < filePaths.length; i += REMOVE_BATCH) {
        const batch = filePaths.slice(i, i + REMOVE_BATCH);
        const { error: removeError } = await serviceClient.storage
          .from("public-assets")
          .remove(batch);

        if (removeError) {
          console.error("Storage remove error after material line delete:", removeError);
          return NextResponse.json(
            {
              error:
                "Material line was removed from the database, but some files could not be deleted from storage. Contact support if you need the folder cleaned up.",
            },
            { status: 500 },
          );
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete material line error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
