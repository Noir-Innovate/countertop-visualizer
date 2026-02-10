import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

interface RouteParams {
  params: Promise<{ materialLineId: string }>;
}

function normalizeSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { materialLineId } = await params;

    const body = await request.json();
    const { targetOrganizationId, newSlug: rawSlug, name: customName } = body;

    if (!targetOrganizationId || typeof rawSlug !== "string") {
      return NextResponse.json(
        { error: "targetOrganizationId and newSlug are required" },
        { status: 400 },
      );
    }

    const newSlug = normalizeSlug(rawSlug);
    if (!newSlug) {
      return NextResponse.json(
        { error: "Please enter a valid URL slug" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Load source material line
    const { data: sourceLine, error: sourceLineError } = await supabase
      .from("material_lines")
      .select("*")
      .eq("id", materialLineId)
      .single();

    if (sourceLineError || !sourceLine) {
      return NextResponse.json(
        { error: "Material line not found" },
        { status: 404 },
      );
    }

    const sourceOrgId = sourceLine.organization_id as string;

    // Verify user is owner or admin of source org
    const { data: sourceMembership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("profile_id", user.id)
      .eq("organization_id", sourceOrgId)
      .single();

    if (
      !sourceMembership ||
      (sourceMembership.role !== "owner" && sourceMembership.role !== "admin")
    ) {
      return NextResponse.json(
        { error: "You must be an owner or admin of the source organization" },
        { status: 403 },
      );
    }

    // Verify user is owner or admin of target org and get target org slug
    const { data: targetMembership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("profile_id", user.id)
      .eq("organization_id", targetOrganizationId)
      .single();

    if (
      !targetMembership ||
      (targetMembership.role !== "owner" && targetMembership.role !== "admin")
    ) {
      return NextResponse.json(
        { error: "You must be an owner or admin of the target organization" },
        { status: 403 },
      );
    }

    const { data: targetOrg } = await supabase
      .from("organizations")
      .select("slug")
      .eq("id", targetOrganizationId)
      .single();

    if (!targetOrg?.slug) {
      return NextResponse.json(
        {
          error:
            "Target organization has no slug. Please update the organization first.",
        },
        { status: 400 },
      );
    }

    // Check slug is globally unique
    const { data: existingLine } = await supabase
      .from("material_lines")
      .select("id")
      .eq("slug", newSlug)
      .single();

    if (existingLine) {
      return NextResponse.json(
        {
          error:
            "This URL slug is already taken. Please choose a different one.",
        },
        { status: 400 },
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

    const targetFolder = `${targetOrg.slug}/${newSlug}`;

    // Create new material line (exclude custom_domain, custom_domain_verified)
    const newName =
      typeof customName === "string" && customName.trim()
        ? customName.trim()
        : `${sourceLine.name} (Copy)`;
    const { data: newLine, error: insertLineError } = await serviceClient
      .from("material_lines")
      .insert({
        organization_id: targetOrganizationId,
        slug: newSlug,
        name: newName,
        logo_url: sourceLine.logo_url,
        primary_color: sourceLine.primary_color ?? "#2563eb",
        accent_color: sourceLine.accent_color ?? "#f59e0b",
        background_color: sourceLine.background_color ?? "#ffffff",
        supabase_folder: targetFolder,
        display_title: sourceLine.display_title ?? sourceLine.name,
        email_sender_name: sourceLine.email_sender_name ?? null,
        email_reply_to: sourceLine.email_reply_to ?? null,
      })
      .select("id")
      .single();

    if (insertLineError || !newLine) {
      console.error("Insert material line error:", insertLineError);
      return NextResponse.json(
        { error: insertLineError?.message ?? "Failed to create material line" },
        { status: 500 },
      );
    }

    const newMaterialLineId = newLine.id;

    // Copy materials
    const { data: materials } = await serviceClient
      .from("materials")
      .select("filename, title, description, material_type, order")
      .eq("material_line_id", materialLineId);

    if (materials?.length) {
      const { error: materialsError } = await serviceClient
        .from("materials")
        .insert(
          materials.map((m) => ({
            material_line_id: newMaterialLineId,
            filename: m.filename,
            title: m.title,
            description: m.description ?? null,
            material_type: m.material_type ?? null,
            order: m.order ?? 0,
          })),
        );

      if (materialsError) {
        console.error("Copy materials error:", materialsError);
        // Continue; line already created
      }
    }

    // Copy kitchen_images
    const { data: kitchenImages } = await serviceClient
      .from("kitchen_images")
      .select("filename, title, order")
      .eq("material_line_id", materialLineId);

    if (kitchenImages?.length) {
      const { error: kitchenError } = await serviceClient
        .from("kitchen_images")
        .insert(
          kitchenImages.map((k) => ({
            material_line_id: newMaterialLineId,
            filename: k.filename,
            title: k.title,
            order: k.order ?? 0,
          })),
        );

      if (kitchenError) {
        console.error("Copy kitchen_images error:", kitchenError);
      }
    }

    // Copy material_line_notifications
    const { data: notifications } = await serviceClient
      .from("material_line_notifications")
      .select("profile_id, sms_enabled, email_enabled")
      .eq("material_line_id", materialLineId);

    if (notifications?.length) {
      const { error: notifError } = await serviceClient
        .from("material_line_notifications")
        .insert(
          notifications.map((n) => ({
            material_line_id: newMaterialLineId,
            profile_id: n.profile_id,
            sms_enabled: n.sms_enabled ?? true,
            email_enabled: n.email_enabled ?? true,
          })),
        );

      if (notifError) {
        console.error("Copy notifications error:", notifError);
      }
    }

    // Copy storage: list all files under source folder then fetch and upload to target
    const sourceFolder = sourceLine.supabase_folder as string;
    const publicBase = `${supabaseUrl}/storage/v1/object/public/public-assets`;

    const collectFilePaths = async (
      prefix: string,
      paths: string[],
    ): Promise<void> => {
      const { data: items } = await serviceClient.storage
        .from("public-assets")
        .list(prefix, { limit: 500 });

      if (!items?.length) return;

      for (const item of items) {
        const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
        // If it looks like a folder (no extension or known folder name), list inside it
        const hasImageExtension = /\.(jpg|jpeg|png|webp|gif|tif|tiff)$/i.test(
          item.name,
        );
        if (!hasImageExtension && (item.id == null || item.metadata == null)) {
          await collectFilePaths(fullPath, paths);
        } else {
          paths.push(fullPath);
        }
      }
    };

    const filePaths: string[] = [];
    await collectFilePaths(sourceFolder, filePaths);

    for (const filePath of filePaths) {
      try {
        const url = `${publicBase}/${filePath}`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const blob = await res.blob();
        const suffix = filePath.startsWith(sourceFolder)
          ? filePath.slice(sourceFolder.length).replace(/^\//, "")
          : filePath;
        if (!suffix) continue;
        const targetPath = `${targetFolder}/${suffix}`;
        await serviceClient.storage
          .from("public-assets")
          .upload(targetPath, blob, {
            upsert: true,
            contentType: res.headers.get("content-type") ?? undefined,
          });
      } catch (err) {
        console.error("Storage copy error for", filePath, err);
      }
    }

    return NextResponse.json({
      id: newMaterialLineId,
      targetOrganizationId,
    });
  } catch (err) {
    console.error("Duplicate material line error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
